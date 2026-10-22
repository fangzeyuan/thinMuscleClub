import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { openDb, type Db } from '../src/db/client'
import { loadEnv } from '../src/env'
import { defaultExtraBody } from '../src/routes/ai'

/** 模拟模型服务：记录收到的请求体；按 messages 里的指令返回不同结果 */
let upstream: Server
let base = ''
let lastBody: Record<string, unknown> = {}
let db: Db
let close: () => Promise<void>

beforeAll(async () => {
  upstream = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      lastBody = JSON.parse(raw)
      const cmd = (lastBody.messages as { content: string }[]).at(-1)!.content
      if (cmd === 'fail') {
        res.writeHead(429, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: { message: '余额不足或无可用资源包,请充值。' } }))
      }
      if (!lastBody.stream) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '整段回复' } }] }))
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const chunk = (delta: object) => res.write(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`)
      chunk({ reasoning_content: '想一想' })
      chunk({ content: '你好' })
      if (cmd === 'cut') return void setTimeout(() => res.destroy(), 50) // 说到一半断流
      chunk({ content: '，加油' })
      res.end('data: [DONE]\n\n')
    })
  })
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`
  ;({ db, close } = await openDb('pglite://memory'))
})
afterAll(async () => {
  upstream.close()
  await close()
})

const make = (over: object = {}) =>
  buildApp({
    env: loadEnv({ NODE_ENV: 'test', DATABASE_URL: 'pglite://memory', JWT_SECRET: 'test-secret-test-secret-test-secret!!', CODE_PEPPER: 'test-pepper-123456', LLM_BASE_URL: base, LLM_API_KEY: 'k', LLM_MODEL: 'glm-5.3', ...over }),
    db,
    logger: false,
  })
const ask = (content: string, stream = true) => ({ messages: [{ role: 'user', content }], stream })

describe('按模型自动降低思考开销', () => {
  it('glm-5 调低档位；glm-4.5/4.6 关闭思考；千问 3 关闭思考；其他不加参数', () => {
    expect(defaultExtraBody('glm-5.3')).toEqual({ reasoning_effort: 'low' })
    expect(defaultExtraBody('glm-4.5-air')).toEqual({ thinking: { type: 'disabled' } })
    expect(defaultExtraBody('qwen3-plus')).toEqual({ enable_thinking: false })
    expect(defaultExtraBody('glm-4-flash')).toEqual({})
  })
})

describe('/api/chat 代理', () => {
  it('流式：原样转发 SSE，并带上自动参数', async () => {
    const app = await make()
    const res = await app.inject({ method: 'POST', url: '/api/chat', payload: ask('hi') })
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.body).toContain('"content":"你好"')
    expect(res.body).toContain('[DONE]')
    expect(lastBody).toMatchObject({ model: 'glm-5.3', stream: true, reasoning_effort: 'low' })
    await app.close()
  })

  it('LLM_EXTRA_BODY 覆盖自动参数', async () => {
    const app = await make({ LLM_EXTRA_BODY: '{"reasoning_effort":"high"}' })
    await app.inject({ method: 'POST', url: '/api/chat', payload: ask('hi') })
    expect(lastBody.reasoning_effort).toBe('high')
    await app.close()
  })

  it('非流式请求仍然可用', async () => {
    const app = await make()
    const res = await app.inject({ method: 'POST', url: '/api/chat', payload: ask('hi', false) })
    expect(res.json().choices[0].message.content).toBe('整段回复')
    await app.close()
  })

  it('上游报错：返回状态码和可读的错误信息', async () => {
    const app = await make()
    const res = await app.inject({ method: 'POST', url: '/api/chat', payload: ask('fail') })
    expect(res.statusCode).toBe(429)
    expect(res.json().error).toContain('余额不足')
    await app.close()
  })

  it('中途断流：发一条错误事件，前端据此提示重试', async () => {
    const app = await make()
    const res = await app.inject({ method: 'POST', url: '/api/chat', payload: ask('cut') })
    expect(res.body).toContain('"content":"你好"')
    expect(res.body).toMatch(/data: \{"error":/)
    await app.close()
  })
})

describe('连接不上模型服务', () => {
  it('返回中文提示而不是 fetch failed', async () => {
    const app = await make({ LLM_BASE_URL: 'http://127.0.0.1:1' })
    const res = await app.inject({ method: 'POST', url: '/api/chat', payload: ask('hi') })
    expect(res.statusCode).toBe(504)
    expect(res.json().error).toBe('连接模型服务失败，请稍后重试')
    await app.close()
  })
})
