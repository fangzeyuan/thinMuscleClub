import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { consoleSender } from '../src/auth/senders'
import { openDb, type Db } from '../src/db/client'
import { loadEnv } from '../src/env'

const base = { NODE_ENV: 'test', DATABASE_URL: 'pglite://memory', JWT_SECRET: 'test-secret-test-secret-test-secret!!', CODE_PEPPER: 'test-pepper-123456' }
let db: Db
let close: () => Promise<void>
beforeAll(async () => {
  ;({ db, close } = await openDb('pglite://memory'))
})
afterAll(async () => close())

const make = async (over: object) => {
  const email = consoleSender(() => {})
  const app = await buildApp({ env: loadEnv({ ...base, ...over }), db, senders: { phone: consoleSender(() => {}), email }, logger: false })
  return { app, email }
}
const post = (app: Awaited<ReturnType<typeof buildApp>>, url: string, payload: object) => app.inject({ method: 'POST', url, payload })

describe('内测配置', () => {
  it('关闭手机号登录：config 只返回邮箱，手机号发码被拒绝', async () => {
    const { app } = await make({ SMS_PROVIDER: 'none' })
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/config' })).json()).toEqual({ methods: { phone: false, email: true }, inviteOnly: false })
    const r = await post(app, '/api/v1/auth/code', { kind: 'phone', target: '13900000001' })
    expect(r.json().error).toBe('method_disabled')
    await app.close()
  })

  it('白名单：名单外的新邮箱不能注册；名单内可以；大小写不敏感', async () => {
    const { app, email } = await make({ SIGNUP_ALLOWLIST: 'Lin@Example.com, 13900000002' })
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/config' })).json().inviteOnly).toBe(true)
    expect((await post(app, '/api/v1/auth/code', { kind: 'email', target: 'stranger@example.com' })).json().error).toBe('not_invited')
    expect((await post(app, '/api/v1/auth/code', { kind: 'email', target: 'lin@example.com' })).statusCode).toBe(200)
    const code = email.last.get('email:lin@example.com')!
    const v = await post(app, '/api/v1/auth/verify', { kind: 'email', target: 'lin@example.com', code, consents: ['privacy_policy', 'health_data'] })
    expect(v.statusCode).toBe(200)
    await app.close()
  })

  it('白名单后来去掉某人：已注册账号仍然可以登录', async () => {
    const { app } = await make({ SIGNUP_ALLOWLIST: 'someone-else@example.com' })
    // lin@example.com 在上一个测试里已经注册
    expect((await post(app, '/api/v1/auth/code', { kind: 'email', target: 'lin@example.com' })).statusCode).not.toBe(403)
    await app.close()
  })

  it('生产环境配置检查：SMTP 缺参数、两种登录都关闭时拒绝启动', () => {
    const prod = { ...base, NODE_ENV: 'production', DATABASE_URL: 'postgres://x', SMS_PROVIDER: 'none' }
    expect(() => loadEnv({ ...prod, EMAIL_PROVIDER: 'smtp' })).toThrow(/SMTP/)
    expect(() => loadEnv({ ...prod, EMAIL_PROVIDER: 'none' })).toThrow(/登录方式/)
    expect(() => loadEnv({ ...prod, EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.qq.com', SMTP_USER: 'a@qq.com', SMTP_PASS: 'x' })).not.toThrow()
  })
})

describe('网页托管', () => {
  it('静态文件 + 单页应用回退 + 缓存策略；/api 不会回退到网页', async () => {
    const { app } = await make({ WEB_DIST: fileURLToPath(new URL('./fixtures/web', import.meta.url)) })
    const index = await app.inject({ method: 'GET', url: '/' })
    expect(index.body).toContain('tmc')
    expect(index.headers['cache-control']).toBe('no-cache')
    const asset = await app.inject({ method: 'GET', url: '/assets/app-abc123.js' })
    expect(asset.headers['cache-control']).toContain('immutable')
    const deep = await app.inject({ method: 'GET', url: '/town' })
    expect(deep.statusCode).toBe(200)
    expect(deep.body).toContain('tmc')
    const api = await app.inject({ method: 'GET', url: '/api/v1/nope' })
    expect(api.statusCode).toBe(404)
    expect(api.json().error).toBe('not_found')
    await app.close()
  })
})
