import { eq, isNotNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { consoleSender } from '../src/auth/senders'
import { openDb, type Db } from '../src/db/client'
import { refreshTokens, verificationCodes } from '../src/db/schema'
import { loadEnv } from '../src/env'

let db: Db
let close: () => Promise<void>
let app: Awaited<ReturnType<typeof buildApp>>
const phone = consoleSender(() => {})
const email = consoleSender(() => {})

beforeAll(async () => {
  const env = loadEnv({ NODE_ENV: 'test', DATABASE_URL: 'pglite://memory', JWT_SECRET: 'test-secret-test-secret-test-secret!!', CODE_PEPPER: 'test-pepper-123456' })
  ;({ db, close } = await openDb(env.DATABASE_URL))
  app = await buildApp({ env, db, senders: { phone, email }, logger: false })
})
afterAll(async () => {
  await app.close()
  await close()
})

const post = (url: string, payload: object, headers: Record<string, string> = {}) => app.inject({ method: 'POST', url, payload, headers })
const CONSENTS = ['privacy_policy', 'health_data']

async function sendCode(target: string, kind: 'phone' | 'email' = 'phone') {
  const res = await post('/api/v1/auth/code', { kind, target })
  expect(res.statusCode).toBe(200)
  const norm = kind === 'phone' ? `+86${target.replace(/\D/g, '').replace(/^86/, '')}` : target.trim().toLowerCase()
  return (kind === 'phone' ? phone : email).last.get(`${kind}:${norm}`)!
}

async function login(target: string, extra: object = {}) {
  const code = await sendCode(target)
  const res = await post('/api/v1/auth/verify', { kind: 'phone', target, code, consents: CONSENTS, ...extra })
  expect(res.statusCode).toBe(200)
  return res
}

const cookieOf = (res: { cookies: { name: string; value: string }[] }) => res.cookies.find((c) => c.name === 'tmc_rt')?.value

describe('发送验证码', () => {
  it('校验格式：非法手机号 / 邮箱', async () => {
    expect((await post('/api/v1/auth/code', { kind: 'phone', target: '12345' })).statusCode).toBe(400)
    expect((await post('/api/v1/auth/code', { kind: 'email', target: 'not-an-email' })).statusCode).toBe(400)
  })

  it('60 秒内不能重复发送', async () => {
    await sendCode('13800000001')
    const res = await post('/api/v1/auth/code', { kind: 'phone', target: '13800000001' })
    expect(res.statusCode).toBe(429)
    expect(res.json().error).toBe('too_frequent')
  })

  it('每天最多 10 次', async () => {
    const old = new Date(Date.now() - 5 * 60 * 1000)
    for (let i = 0; i < 10; i++)
      await db.insert(verificationCodes).values({ id: `old${i}`, kind: 'phone', target: '+8613800000002', codeHash: 'x', expiresAt: old, createdAt: old })
    const res = await post('/api/v1/auth/code', { kind: 'phone', target: '13800000002' })
    expect(res.statusCode).toBe(429)
    expect(res.json().error).toBe('daily_limit')
  })

  it('数据库里只存验证码哈希', async () => {
    const code = await sendCode('13800000003')
    const [row] = await db.select().from(verificationCodes).where(eq(verificationCodes.target, '+8613800000003'))
    expect(row.codeHash).not.toContain(code)
    expect(row.codeHash).toHaveLength(64)
  })
})

describe('登录 / 注册', () => {
  it('新用户必须同意条款；同意前不消耗验证码', async () => {
    const code = await sendCode('13800000010')
    const r1 = await post('/api/v1/auth/verify', { kind: 'phone', target: '13800000010', code })
    expect(r1.statusCode).toBe(409)
    expect(r1.json().error).toBe('consent_required')
    const r2 = await post('/api/v1/auth/verify', { kind: 'phone', target: '13800000010', code, consents: CONSENTS })
    expect(r2.statusCode).toBe(200)
    expect(r2.json().user.isNew).toBe(true)
    expect(cookieOf(r2)).toBeTruthy()
  })

  it('登录后 /me 返回脱敏的身份和同意记录', async () => {
    const res = await login('138 0000 0011')
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { authorization: `Bearer ${res.json().accessToken}` } })
    expect(me.statusCode).toBe(200)
    expect(me.json().identities).toEqual([{ kind: 'phone', display: '138****0011' }])
    expect(me.json().consents.map((c: { kind: string }) => c.kind).sort()).toEqual(CONSENTS.sort())
  })

  it('老用户再次登录：同一个账号，不需要再同意条款', async () => {
    const first = await login('13800000012')
    // 跳过 60 秒冷却：把上一条验证码的发送时间往前挪
    await db.update(verificationCodes).set({ createdAt: new Date(Date.now() - 120_000) }).where(eq(verificationCodes.target, '+8613800000012'))
    const code = await sendCode('13800000012')
    const second = await post('/api/v1/auth/verify', { kind: 'phone', target: '+86 13800000012', code })
    expect(second.statusCode).toBe(200)
    expect(second.json().user).toEqual({ id: first.json().user.id, isNew: false })
  })

  it('同一个验证码不能用两次', async () => {
    const code = await sendCode('13800000013')
    expect((await post('/api/v1/auth/verify', { kind: 'phone', target: '13800000013', code, consents: CONSENTS })).statusCode).toBe(200)
    expect((await post('/api/v1/auth/verify', { kind: 'phone', target: '13800000013', code, consents: CONSENTS })).json().error).toBe('invalid_code')
  })

  it('错 5 次后验证码作废，正确的也不行', async () => {
    const code = await sendCode('13800000014')
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) expect((await post('/api/v1/auth/verify', { kind: 'phone', target: '13800000014', code: wrong, consents: CONSENTS })).statusCode).toBe(400)
    expect((await post('/api/v1/auth/verify', { kind: 'phone', target: '13800000014', code, consents: CONSENTS })).statusCode).toBe(400)
  })

  it('邮箱大小写和空格不影响：是同一个账号', async () => {
    const c1 = await sendCode('Lin@Example.com', 'email')
    const a = await post('/api/v1/auth/verify', { kind: 'email', target: 'Lin@Example.com', code: c1, consents: CONSENTS })
    await db.update(verificationCodes).set({ createdAt: new Date(Date.now() - 120_000) }).where(eq(verificationCodes.target, 'lin@example.com'))
    const c2 = await sendCode('  lin@example.COM ', 'email')
    const b = await post('/api/v1/auth/verify', { kind: 'email', target: 'lin@example.com', code: c2 })
    expect(b.json().user.id).toBe(a.json().user.id)
  })

  it('无效或伪造的 access token 返回 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/me' })).statusCode).toBe(401)
    const res = await login('13800000015')
    const forged = res.json().accessToken.slice(0, -4) + 'abcd'
    expect((await app.inject({ method: 'GET', url: '/api/v1/me', headers: { authorization: `Bearer ${forged}` } })).statusCode).toBe(401)
  })
})

describe('Refresh token', () => {
  it('轮换：每次刷新换一个新的', async () => {
    const res = await login('13800000020')
    const rt1 = cookieOf(res)!
    const r = await post('/api/v1/auth/refresh', {}, { cookie: `tmc_rt=${rt1}` })
    expect(r.statusCode).toBe(200)
    expect(r.json().accessToken).toBeTruthy()
    expect(cookieOf(r)).toBeTruthy()
    expect(cookieOf(r)).not.toBe(rt1)
  })

  it('多标签页并发刷新（30 秒内重复使用）：只发 access token，不判定为泄露', async () => {
    const rt1 = cookieOf(await login('13800000021'))!
    const a = await post('/api/v1/auth/refresh', {}, { cookie: `tmc_rt=${rt1}` })
    const b = await post('/api/v1/auth/refresh', {}, { cookie: `tmc_rt=${rt1}` })
    expect(b.statusCode).toBe(200)
    expect(cookieOf(b)).toBeUndefined()
    expect((await post('/api/v1/auth/refresh', {}, { cookie: `tmc_rt=${cookieOf(a)}` })).statusCode).toBe(200)
  })

  it('旧 token 过了宽限期被再次使用 → 判定泄露，所有设备下线', async () => {
    const rt1 = cookieOf(await login('13800000022'))!
    const rt2 = cookieOf(await post('/api/v1/auth/refresh', {}, { cookie: `tmc_rt=${rt1}` }))!
    // 模拟时间流逝：把已轮换 token 的作废时间挪到 1 分钟前（超出 30 秒宽限期）
    await db.update(refreshTokens).set({ revokedAt: new Date(Date.now() - 60_000) }).where(isNotNull(refreshTokens.replacedBy))
    const reuse = await post('/api/v1/auth/refresh', {}, { cookie: `tmc_rt=${rt1}` })
    expect(reuse.statusCode).toBe(401)
    expect(reuse.json().error).toBe('token_reused')
    expect((await post('/api/v1/auth/refresh', {}, { cookie: `tmc_rt=${rt2}` })).statusCode).toBe(401)
  })

  it('退出后 refresh token 失效', async () => {
    const rt = cookieOf(await login('13800000023'))!
    expect((await post('/api/v1/auth/logout', {}, { cookie: `tmc_rt=${rt}` })).statusCode).toBe(204)
    expect((await post('/api/v1/auth/refresh', {}, { cookie: `tmc_rt=${rt}` })).statusCode).toBe(401)
  })

  it('小程序：refresh token 放在响应体里，用请求体刷新', async () => {
    const res = await login('13800000024', { client: 'miniapp' })
    expect(cookieOf(res)).toBeUndefined()
    const rt = res.json().refreshToken
    expect(rt).toBeTruthy()
    const r = await post('/api/v1/auth/refresh', { client: 'miniapp', refreshToken: rt })
    expect(r.statusCode).toBe(200)
    expect(r.json().refreshToken).toBeTruthy()
  })
})
