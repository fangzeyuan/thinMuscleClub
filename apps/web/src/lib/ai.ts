import { TOOLS, buildSystemPrompt, executeTool, type Apply } from '@tmc/core/ai'
import { uid, type AppState, type ChatMsg, type ToolCall } from './store'

/* ---------------- 对话循环 ---------------- */

const toApi = (m: ChatMsg) => {
  const out: Record<string, unknown> = { role: m.role, content: m.content ?? '' }
  if (m.tool_calls?.length) out.tool_calls = m.tool_calls
  if (m.tool_call_id) out.tool_call_id = m.tool_call_id
  return out
}

/** 只发送最近的对话（跳过出错和生成中的消息），并保证不会以孤立的 tool 消息开头 */
function recentHistory(chat: ChatMsg[], max = 24) {
  const ok = chat.filter((m) => !m.error && !m.pending)
  let start = Math.max(0, ok.length - max)
  while (start < ok.length && ok[start].role !== 'user') start++
  return ok.slice(start)
}

/** 超时：45 秒没开始回复、或 30 秒没有新内容、或总共 2 分钟没说完 */
const FIRST_BYTE_MS = 45_000
const IDLE_MS = 30_000
const TOTAL_MS = 120_000

export interface Progress {
  content: string
  phase?: ChatMsg['phase']
}

/**
 * 流式请求模型：边生成边回调 onProgress，结束后返回完整内容和工具调用。
 * 任何情况下都会在超时后结束（不会一直挂着导致后面的消息发不出去）。
 */
async function streamCompletion(messages: unknown[], onProgress: (p: Progress) => void): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const ctrl = new AbortController()
  let idle: ReturnType<typeof setTimeout> | undefined
  const arm = (ms: number, why: string) => {
    clearTimeout(idle)
    idle = setTimeout(() => ctrl.abort(new Error(why)), ms)
  }
  const total = setTimeout(() => ctrl.abort(new Error('小薄这次想得太久了，请重试')), TOTAL_MS)
  arm(FIRST_BYTE_MS, '模型响应超时，请重试')

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, tools: TOOLS, stream: true }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d?.error?.message || d?.error || `请求失败（${res.status}）`)
    }

    // 服务端没走流式（例如旧版本）：按整段处理
    if (!(res.headers.get('content-type') ?? '').includes('text/event-stream') || !res.body) {
      const d = await res.json()
      const msg = d?.choices?.[0]?.message
      if (!msg) throw new Error('模型没有返回内容')
      return { content: (msg.content ?? '').trim(), toolCalls: (msg.tool_calls ?? []).filter((c: ToolCall) => c?.function?.name) }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let content = ''
    let phase: Progress['phase'] = 'waiting'
    const calls: { id: string; name: string; args: string }[] = []

    for (;;) {
      arm(IDLE_MS, '模型长时间没有返回内容，请重试')
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let cut: number
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        const event = buf.slice(0, cut)
        buf = buf.slice(cut + 2)
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (!data || data === '[DONE]') continue
          let j: { error?: string | { message?: string }; choices?: { delta?: Record<string, unknown> }[] }
          try {
            j = JSON.parse(data)
          } catch {
            continue
          }
          if (j.error) throw new Error(typeof j.error === 'string' ? j.error : j.error.message || '模型出错了')
          const delta = (j.choices?.[0]?.delta ?? {}) as { content?: string; reasoning_content?: string; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] }
          if (delta.reasoning_content && !content) phase = 'thinking'
          if (delta.content) {
            content = (content + delta.content).replace(/^\s+/, '') // 有的模型回复以空行开头
            phase = undefined
          }
          for (const tc of delta.tool_calls ?? []) {
            // 按 index 累加分片；没有 index 时按 id 区分
            let k = tc.index ?? (tc.id ? calls.findIndex((c) => c.id === tc.id) : calls.length - 1)
            if (k < 0) k = calls.length
            const c = (calls[k] ??= { id: '', name: '', args: '' })
            if (tc.id) c.id = tc.id
            if (tc.function?.name) c.name = c.name.endsWith(tc.function.name) ? c.name : c.name + tc.function.name
            if (tc.function?.arguments) c.args += tc.function.arguments
            phase = 'tools'
          }
        }
        onProgress({ content, phase })
      }
    }
    return {
      content,
      toolCalls: calls.filter((c) => c.name).map((c, i) => ({ id: c.id || `call_${Date.now()}_${i}`, type: 'function' as const, function: { name: c.name, arguments: c.args || '{}' } })),
    }
  } catch (e) {
    if (ctrl.signal.aborted && ctrl.signal.reason instanceof Error) throw ctrl.signal.reason
    if (e instanceof TypeError) throw new Error('网络中断了，请重试')
    throw e
  } finally {
    clearTimeout(idle)
    clearTimeout(total)
  }
}

export interface ChatDeps {
  getState: () => AppState
  apply: Apply
  push: (m: ChatMsg) => void
  patch: (id: string, p: Partial<ChatMsg>) => void
  today: string
}

/**
 * 发送一条消息并完成整轮对话（可能包含多次工具调用）。
 * userText 为 null 时是"重试"：不重复添加用户消息，直接用已有记录再请求一次。
 * 出错不会抛出：会把出错原因写进回复气泡，并标记为可重试。
 */
export async function runChat(deps: ChatDeps, userText: string | null) {
  const { getState, apply, push, patch, today } = deps
  // 本轮内维护一份工作副本，保证工具连续调用时看到最新数据
  let working = getState()
  const applyBoth: Apply = (op) => {
    working = op(working)
    apply(op)
  }
  const add = (m: ChatMsg) => {
    working = { ...working, chat: [...working.chat, m] }
    push(m)
  }
  const update = (id: string, p: Partial<ChatMsg>) => {
    working = { ...working, chat: working.chat.map((m) => (m.id === id ? { ...m, ...p } : m)) }
    patch(id, p)
  }

  if (userText !== null) add({ id: uid(), role: 'user', content: userText, ts: Date.now() })

  for (let round = 0; round < 5; round++) {
    const id = uid()
    add({ id, role: 'assistant', content: '', pending: true, phase: 'waiting', ts: Date.now() })

    // 合并高频更新：最多每 80ms 刷新一次界面
    let latest: Progress | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      timer = null
      if (latest) patch(id, { content: latest.content, phase: latest.phase })
    }

    try {
      const messages = [{ role: 'system', content: buildSystemPrompt(working) }, ...recentHistory(working.chat).map(toApi)]
      const { content, toolCalls } = await streamCompletion(messages, (p) => {
        latest = p
        timer ??= setTimeout(flush, 80)
      })
      if (timer) clearTimeout(timer)
      update(id, { content: content || null, tool_calls: toolCalls.length ? toolCalls : undefined, pending: false, phase: undefined, ts: Date.now() })
      if (!toolCalls.length) {
        if (!content) update(id, { content: '小薄这次没想好怎么回答，换个说法再试试？', error: true, retryable: true })
        return
      }
      for (const c of toolCalls) {
        const { result, label } = executeTool(c, applyBoth, () => working, today)
        add({ id: uid(), role: 'tool', tool_call_id: c.id, content: result, label, ts: Date.now() })
      }
    } catch (e) {
      if (timer) clearTimeout(timer)
      const partial = (latest as Progress | null)?.content
      update(id, {
        content: `${partial ? `${partial}\n\n` : ''}${(e as Error).message || '出错了，请重试'}`,
        pending: false,
        phase: undefined,
        error: true,
        retryable: true,
      })
      return
    }
  }
}

export async function checkAiConfig(): Promise<{ configured: boolean; model?: string; provider?: string }> {
  try {
    const r = await fetch('/api/health')
    return await r.json()
  } catch {
    return { configured: false }
  }
}
