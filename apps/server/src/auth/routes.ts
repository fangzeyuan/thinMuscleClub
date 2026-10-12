import { uid } from '@tmc/core/state'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Db } from '../db/client'
import { authIdentities, consents, users, verificationCodes, type ConsentKind } from '../db/schema'
import type { Env } from '../env'
import { hashCode, randomCode, safeEqual } from './crypto'
import type { CodeSender } from './senders'
import { normalizeTarget, type CodeKind } from './targets'
import { ACCESS_TTL_SEC, REFRESH_TTL_MS, issueRefresh, revokeToken, rotateRefresh, signAccess } from './tokens'

export const CONSENT_VERSION = '2026-10'
/** 新用户注册时必须同意的条款；ai_processing 在第一次使用教练时单独询问 */
const REQUIRED_CONSENTS: ConsentKind[] = ['privacy_policy', 'health_data']

const CODE_TTL_MS = 10 * 60 * 1000
const COOLDOWN_MS = 60 * 1000
const DAILY_LIMIT = 10
const MAX_ATTEMPTS = 5
const COOKIE = 'tmc_rt'
const COOKIE_PATH = '/api/v1/auth'

const kindSchema = z.enum(['phone', 'email'])

export interface AuthDeps {
  db: Db
  env: Env
  senders: Record<CodeKind, CodeSender>
  /** 开放的登录方式（短信签名未就绪时关闭手机号登录） */
  methods: Record<CodeKind, boolean>
  /** 内测白名单（已规范化）；为空 = 开放注册 */
  allowlist: Set<string>
}

export function authRoutes(app: FastifyInstance, deps: AuthDeps) {
  const { db, env, senders, methods, allowlist } = deps
  const isProd = env.NODE_ENV === 'production'
  /** 开发环境 + 验证码打印到日志时，把验证码直接返回给前端自动填入（不用翻服务端日志）。生产环境不会走到这里（env.ts 禁止 console 方式） */
  const devShowCode = (kind: CodeKind) => env.NODE_ENV === 'development' && (kind === 'phone' ? env.SMS_PROVIDER : env.EMAIL_PROVIDER) === 'console'

  const fail = (reply: FastifyReply, status: number, error: string, message: string, extra: object = {}) =>
    reply.status(status).send({ error, message, ...extra })

  const setRefreshCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(COOKIE, token, { httpOnly: true, secure: isProd, sameSite: 'lax', path: COOKIE_PATH, maxAge: REFRESH_TTL_MS / 1000 })

  /** 小程序没有 Cookie：请求里带 client=miniapp 时，refresh token 放在响应体里 */
  const tokenResponse = async (req: FastifyRequest, reply: FastifyReply, userId: string, refresh: string | null, extra: object = {}) => {
    const body: Record<string, unknown> = { accessToken: await signAccess(env.JWT_SECRET, userId), expiresIn: ACCESS_TTL_SEC, ...extra }
    const miniapp = (req.body as { client?: string } | undefined)?.client === 'miniapp'
    if (refresh) {
      if (miniapp) body.refreshToken = refresh
      else setRefreshCookie(reply, refresh)
    }
    return reply.send(body)
  }

  const readRefresh = (req: FastifyRequest) => (req.body as { refreshToken?: string } | undefined)?.refreshToken ?? req.cookies[COOKIE]

  /** 内测白名单：新用户必须在名单里；已注册用户不受影响 */
  const invited = async (kind: CodeKind, target: string) => {
    if (!allowlist.size || allowlist.has(target)) return true
    const [hit] = await db.select({ id: authIdentities.id }).from(authIdentities).where(and(eq(authIdentities.kind, kind), eq(authIdentities.value, target)))
    return Boolean(hit)
  }
  const notInvited = (reply: FastifyReply) => fail(reply, 403, 'not_invited', '内测中，暂未开放注册。如需体验请联系开发者')

  app.get('/api/v1/auth/config', async () => ({ methods, inviteOnly: allowlist.size > 0 }))

  /* ---------- 发送验证码 ---------- */
  app.post('/api/v1/auth/code', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (req, reply) => {
    const parsed = z.object({ kind: kindSchema, target: z.string().max(254) }).safeParse(req.body)
    if (!parsed.success) return fail(reply, 400, 'bad_request', '参数不正确')
    const { kind } = parsed.data
    if (!methods[kind]) return fail(reply, 400, 'method_disabled', kind === 'phone' ? '手机号登录暂未开放，请使用邮箱登录' : '邮箱登录暂未开放')
    const target = normalizeTarget(kind, parsed.data.target)
    if (!target) return fail(reply, 400, 'invalid_target', kind === 'phone' ? '请输入正确的手机号' : '请输入正确的邮箱')
    if (!(await invited(kind, target))) return notInvited(reply)

    const now = Date.now()
    const [{ recent, today }] = await db
      .select({
        recent: sql<number>`count(*) filter (where ${verificationCodes.createdAt} > ${new Date(now - COOLDOWN_MS)})`.mapWith(Number),
        today: sql<number>`count(*)`.mapWith(Number),
      })
      .from(verificationCodes)
      .where(and(eq(verificationCodes.kind, kind), eq(verificationCodes.target, target), gt(verificationCodes.createdAt, new Date(now - 24 * 3600 * 1000))))
    if (recent > 0) return fail(reply, 429, 'too_frequent', '发送太频繁，请稍后再试', { retryAfter: 60 })
    if (today >= DAILY_LIMIT) return fail(reply, 429, 'daily_limit', '今天发送次数已达上限，请明天再试')

    const code = randomCode()
    await db.insert(verificationCodes).values({
      id: uid(),
      kind,
      target,
      codeHash: hashCode(env.CODE_PEPPER, kind, target, code),
      expiresAt: new Date(now + CODE_TTL_MS),
      ip: req.ip,
    })
    try {
      await senders[kind].send(kind, target, code)
    } catch (e) {
      req.log.error({ err: e }, 'code send failed')
      return fail(reply, 502, 'send_failed', '验证码发送失败，请稍后再试')
    }
    return reply.send({ ok: true, cooldown: COOLDOWN_MS / 1000, ...(devShowCode(kind) ? { devCode: code } : {}) })
  })

  /* ---------- 校验验证码：登录或注册 ---------- */
  app.post('/api/v1/auth/verify', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (req, reply) => {
    const parsed = z
      .object({
        kind: kindSchema,
        target: z.string().max(254),
        code: z.string().regex(/^\d{6}$/),
        consents: z.array(z.enum(['privacy_policy', 'health_data', 'ai_processing'])).optional(),
        client: z.enum(['web', 'miniapp']).optional(),
      })
      .safeParse(req.body)
    if (!parsed.success) return fail(reply, 400, 'bad_request', '参数不正确')
    const { kind, code } = parsed.data
    const target = normalizeTarget(kind, parsed.data.target)
    // 统一错误文案，不暴露"这个号码是否注册过"
    const invalid = () => fail(reply, 400, 'invalid_code', '验证码不正确或已过期')
    if (!target) return invalid()

    const [row] = await db
      .select()
      .from(verificationCodes)
      .where(and(eq(verificationCodes.kind, kind), eq(verificationCodes.target, target), isNull(verificationCodes.consumedAt), gt(verificationCodes.expiresAt, new Date())))
      .orderBy(desc(verificationCodes.createdAt))
      .limit(1)
    if (!row || row.attempts >= MAX_ATTEMPTS) return invalid()

    if (!safeEqual(row.codeHash, hashCode(env.CODE_PEPPER, kind, target, code))) {
      await db.update(verificationCodes).set({ attempts: row.attempts + 1 }).where(eq(verificationCodes.id, row.id))
      return invalid()
    }

    const [identity] = await db.select().from(authIdentities).where(and(eq(authIdentities.kind, kind), eq(authIdentities.value, target)))
    const granted = new Set(parsed.data.consents ?? [])

    if (!identity && !(await invited(kind, target))) return notInvited(reply)

    // 新用户必须先同意条款；此时不消耗验证码，同意后可以用同一个验证码继续
    if (!identity && REQUIRED_CONSENTS.some((c) => !granted.has(c))) {
      return fail(reply, 409, 'consent_required', '请先阅读并同意隐私政策和健康数据处理说明', { required: REQUIRED_CONSENTS, version: CONSENT_VERSION })
    }

    const userId = await db.transaction(async (tx) => {
      // 条件更新防止同一个验证码被并发使用两次
      const used = await tx
        .update(verificationCodes)
        .set({ consumedAt: new Date() })
        .where(and(eq(verificationCodes.id, row.id), isNull(verificationCodes.consumedAt)))
        .returning({ id: verificationCodes.id })
      if (!used.length) return null
      if (identity) return identity.userId
      const id = uid()
      await tx.insert(users).values({ id })
      await tx.insert(authIdentities).values({ id: uid(), userId: id, kind, value: target, verifiedAt: new Date() })
      await tx.insert(consents).values([...granted].map((k) => ({ userId: id, kind: k, version: CONSENT_VERSION })))
      return id
    })
    if (!userId) return invalid()

    const refresh = await issueRefresh(db, userId, req.headers['user-agent'])
    return tokenResponse(req, reply, userId, refresh.token, { user: { id: userId, isNew: !identity } })
  })

  /* ---------- 刷新 ---------- */
  app.post('/api/v1/auth/refresh', async (req, reply) => {
    const token = readRefresh(req)
    if (!token) return fail(reply, 401, 'unauthenticated', '请重新登录')
    const r = await rotateRefresh(db, token, req.headers['user-agent'])
    if (!r.ok) {
      reply.clearCookie(COOKIE, { path: COOKIE_PATH })
      return fail(reply, 401, r.reason === 'reused' ? 'token_reused' : 'unauthenticated', '登录已失效，请重新登录')
    }
    return tokenResponse(req, reply, r.userId, r.refresh?.token ?? null)
  })

  /* ---------- 退出 ---------- */
  app.post('/api/v1/auth/logout', async (req, reply) => {
    const token = readRefresh(req)
    if (token) await revokeToken(db, token)
    reply.clearCookie(COOKIE, { path: COOKIE_PATH })
    return reply.status(204).send()
  })
}
