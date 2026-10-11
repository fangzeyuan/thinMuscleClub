import type { FastifyInstance } from 'fastify'
import type { Env } from '../env'

/**
 * OpenAI 兼容的 Chat Completions 代理（P1 沿用；P2 改为服务端编排）。
 * API Key 只在服务端，不暴露给浏览器。
 */
const PROVIDERS: [string, string][] = [
  ['dashscope', '通义千问'],
  ['openai.com', 'OpenAI'],
  ['deepseek', 'DeepSeek'],
  ['moonshot', 'Kimi'],
  ['bigmodel', '智谱'],
]

export function aiRoutes(app: FastifyInstance, env: Env) {
  const baseUrl = env.LLM_BASE_URL.replace(/\/+$/, '')
  const provider = PROVIDERS.find(([k]) => baseUrl.includes(k))?.[1] ?? '自定义'

  app.get('/api/health', async () => ({ configured: Boolean(env.LLM_API_KEY), model: env.LLM_MODEL, provider }))

  app.post('/api/chat', { bodyLimit: 1_000_000 }, async (req, reply) => {
    if (!env.LLM_API_KEY) return reply.status(503).send({ error: '服务端未配置 LLM_API_KEY，请参考 .env.example' })
    const { messages, tools } = (req.body ?? {}) as { messages?: unknown[]; tools?: unknown[] }
    if (!Array.isArray(messages)) return reply.status(400).send({ error: 'messages 缺失' })
    try {
      const upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
        body: JSON.stringify({ model: env.LLM_MODEL, messages, tools, temperature: 0.6 }),
        signal: AbortSignal.timeout(60_000),
      })
      const text = await upstream.text()
      let data: Record<string, unknown>
      try {
        data = JSON.parse(text)
      } catch {
        data = { error: text.slice(0, 300) }
      }
      if (!upstream.ok) {
        const err = data.error as { message?: string } | string | undefined
        const message = (typeof err === 'object' ? err?.message : err) || (data.message as string) || `上游错误 ${upstream.status}`
        return reply.status(upstream.status).send({ error: message })
      }
      return reply.send(data)
    } catch (e) {
      const err = e as Error
      return reply.status(502).send({ error: err.name === 'TimeoutError' ? '模型响应超时' : err.message })
    }
  })
}
