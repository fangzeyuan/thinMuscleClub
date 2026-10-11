import { TOOLS, buildSystemPrompt, executeTool, type Apply } from '@tmc/core/ai'
import { uid, type AppState, type ChatMsg, type ToolCall } from './store'

/* ---------------- 对话循环 ---------------- */

const toApi = (m: ChatMsg) => {
  const out: Record<string, unknown> = { role: m.role, content: m.content ?? '' }
  if (m.tool_calls?.length) out.tool_calls = m.tool_calls
  if (m.tool_call_id) out.tool_call_id = m.tool_call_id
  return out
}

/** 只发送最近的对话，并保证不会以孤立的 tool 消息开头 */
function recentHistory(chat: ChatMsg[], max = 24) {
  const ok = chat.filter((m) => !m.error)
  let start = Math.max(0, ok.length - max)
  while (start < ok.length && ok[start].role !== 'user') start++
  return ok.slice(start)
}

export interface ChatDeps {
  getState: () => AppState
  apply: Apply
  push: (m: ChatMsg) => void
  today: string
}

export async function runChat(deps: ChatDeps, userText: string) {
  const { getState, apply, push, today } = deps
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

  add({ id: uid(), role: 'user', content: userText, ts: Date.now() })

  for (let round = 0; round < 5; round++) {
    const messages = [{ role: 'system', content: buildSystemPrompt(working) }, ...recentHistory(working.chat).map(toApi)]
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, tools: TOOLS }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error?.message || data?.error || `请求失败（${res.status}）`)
    const msg = data?.choices?.[0]?.message
    if (!msg) throw new Error('模型没有返回内容')

    const calls: ToolCall[] = (msg.tool_calls ?? []).filter((c: ToolCall) => c?.function?.name)
    add({ id: uid(), role: 'assistant', content: msg.content || null, tool_calls: calls.length ? calls : undefined, ts: Date.now() })
    if (!calls.length) return

    for (const c of calls) {
      const { result, label } = executeTool(c, applyBoth, () => working, today)
      add({ id: uid(), role: 'tool', tool_call_id: c.id, content: result, label, ts: Date.now() })
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
