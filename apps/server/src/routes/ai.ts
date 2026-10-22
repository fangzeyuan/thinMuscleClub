import type { FastifyInstance } from 'fastify'
import type { Env } from '../env'

/**
 * OpenAI 兼容的 Chat Completions 代理（P1 沿用；P2 改为服务端编排）。
 * API Key 只在服务端，不暴露给浏览器。
 * - 支持流式（stream: true）：模型每生成一段就转发给前端，用户不用干等整段回复
 * - 按模型自动降低"深度思考"档位：教练回复是日常对话，不需要长时间推理（实测 glm-5.3 默认 9.5 秒 → low 档 2.6 秒）
 */
const PROVIDERS: [string, string][] = [
  ['dashscope', '通义千问'],
  ['openai.com', 'OpenAI'],
  ['deepseek', 'DeepSeek'],
  ['moonshot', 'Kimi'],
  ['bigmodel', '智谱'],
]

/** 按模型名给出降低思考开销的额外参数；LLM_EXTRA_BODY 可以覆盖 */
export function defaultExtraBody(model: string): Record<string, unknown> {
  const m = model.toLowerCase()
  if (/^glm-5/.test(m)) return { reasoning_effort: 'low' } // 始终思考的模型，只能调低档位
  if (/^glm-4\.[5-9]/.test(m)) return { thinking: { type: 'disabled' } }
  if (/^qwen3/.test(m)) return { enable_thinking: false }
  return {}
}

const FIRST_BYTE_TIMEOUT = 45_000
const TOTAL_TIMEOUT = 120_000

export function aiRoutes(app: FastifyInstance, env: Env) {
  const baseUrl = env.LLM_BASE_URL.replace(/\/+$/, '')
  const provider = PROVIDERS.find(([k]) => baseUrl.includes(k))?.[1] ?? '自定义'
  let extra: Record<string, unknown> = defaultExtraBody(env.LLM_MODEL)
  if (env.LLM_EXTRA_BODY) {
    try {
      extra = JSON.parse(env.LLM_EXTRA_BODY)
    } catch {
      app.log.warn('LLM_EXTRA_BODY 不是合法 JSON，已忽略')
    }
  }

  app.get('/api/health', async () => ({ configured: Boolean(env.LLM_API_KEY), model: env.LLM_MODEL, provider }))

  app.post('/api/chat', { bodyLimit: 1_000_000 }, async (req, reply) => {
    if (!env.LLM_API_KEY) return reply.status(503).send({ error: '服务端未配置 LLM_API_KEY，请参考 .env.example' })
    const { messages, tools, stream } = (req.body ?? {}) as { messages?: unknown[]; tools?: unknown[]; stream?: boolean }
    if (!Array.isArray(messages)) return reply.status(400).send({ error: 'messages 缺失' })

    const abort = new AbortController()
    const total = setTimeout(() => abort.abort(new Error('模型响应超时')), TOTAL_TIMEOUT)
    const firstByte = setTimeout(() => abort.abort(new Error('模型响应超时')), FIRST_BYTE_TIMEOUT)
    // 前端断开（关页面、切走后被系统中断）时，不再白白等上游。
    // 注意：要监听响应的 close —— 请求的 close 在请求体读完时就会触发，并不代表断开
    reply.raw.on('close', () => {
      if (!reply.raw.writableEnded) abort.abort(new Error('客户端已断开'))
    })

    try {
      const upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
        body: JSON.stringify({ model: env.LLM_MODEL, messages, tools, temperature: 0.6, ...extra, ...(stream ? { stream: true } : {}) }),
        signal: abort.signal,
      })
      clearTimeout(firstByte)

      if (!upstream.ok) {
        const text = await upstream.text()
        let data: Record<string, unknown>
        try {
          data = JSON.parse(text)
        } catch {
          data = { error: text.slice(0, 300) }
        }
        const err = data.error as { message?: string } | string | undefined
        const message = (typeof err === 'object' ? err?.message : err) || (data.message as string) || `上游错误 ${upstream.status}`
        return reply.status(upstream.status).send({ error: message })
      }

      if (!stream || !upstream.body) return reply.send(await upstream.json())

      // 流式：原样转发 SSE（text/event-stream），Caddy 会自动逐块刷新
      reply.hijack()
      reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
      try {
        for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) reply.raw.write(chunk)
      } catch (e) {
        // 中途失败：发一条错误事件，前端据此提示并允许重试
        reply.raw.write(`data: ${JSON.stringify({ error: abort.signal.aborted ? String((abort.signal.reason as Error)?.message) : '模型连接中断了，请重试' })}\n\n`)
      }
      reply.raw.end()
    } catch (e) {
      const err = e as Error
      const message = abort.signal.aborted ? String((abort.signal.reason as Error)?.message ?? '模型响应超时') : err.message === 'fetch failed' ? '连接模型服务失败，请稍后重试' : err.message
      if (reply.sent || reply.raw.headersSent) return
      return reply.status(504).send({ error: message })
    } finally {
      clearTimeout(total)
      clearTimeout(firstByte)
    }
  })
}
