import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { and, eq, isNull } from 'drizzle-orm'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { authRoutes } from './auth/routes'
import { consoleSender, notConfiguredSender, type CodeSender } from './auth/senders'
import { maskTarget, type CodeKind } from './auth/targets'
import { verifyAccess } from './auth/tokens'
import type { Db } from './db/client'
import { authIdentities, consents, users } from './db/schema'
import type { Env } from './env'
import { aiRoutes } from './routes/ai'

declare module 'fastify' {
  interface FastifyRequest {
    userId: string
  }
  interface FastifyInstance {
    /** 需要登录的接口用：{ preHandler: app.authenticate }，之后 req.userId 一定存在 */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export interface AppDeps {
  env: Env
  db: Db
  senders?: Record<CodeKind, CodeSender>
  logger?: boolean
}

export async function buildApp({ env, db, senders, logger = true }: AppDeps) {
  const app = Fastify({
    logger: logger && {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      // 日志里不记录请求体（手机号、邮箱、饮食内容等个人信息）
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    trustProxy: true, // 线上在 nginx 后面，取真实 IP 用于限流
  })

  await app.register(cookie)
  await app.register(rateLimit, { global: false })

  app.decorateRequest('userId', '')
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization
    const userId = header?.startsWith('Bearer ') ? await verifyAccess(env.JWT_SECRET, header.slice(7)) : null
    if (!userId) return reply.status(401).send({ error: 'unauthenticated', message: '请先登录' })
    req.userId = userId
  })

  const log = (msg: string) => app.log.info(msg)
  authRoutes(app, {
    db,
    env,
    senders: senders ?? {
      phone: env.SMS_PROVIDER === 'console' ? consoleSender(log) : notConfiguredSender('腾讯云短信'),
      email: env.EMAIL_PROVIDER === 'console' ? consoleSender(log) : notConfiguredSender('邮件服务'),
    },
  })

  app.get('/api/v1/me', { preHandler: app.authenticate }, async (req, reply) => {
    const [user] = await db.select().from(users).where(and(eq(users.id, req.userId), isNull(users.deletedAt)))
    if (!user) return reply.status(401).send({ error: 'unauthenticated', message: '请先登录' })
    const ids = await db.select().from(authIdentities).where(eq(authIdentities.userId, req.userId))
    const granted = await db.select().from(consents).where(and(eq(consents.userId, req.userId), isNull(consents.revokedAt)))
    return {
      id: user.id,
      nickname: user.nickname,
      identities: ids.map((i) => ({ kind: i.kind, display: maskTarget(i.kind, i.value) })),
      consents: granted.map((c) => ({ kind: c.kind, version: c.version })),
    }
  })

  aiRoutes(app, env)

  return app
}
