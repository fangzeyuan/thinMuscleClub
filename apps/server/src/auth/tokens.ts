import { uid } from '@tmc/core/state'
import { and, eq, isNull } from 'drizzle-orm'
import { SignJWT, jwtVerify } from 'jose'
import type { Db } from '../db/client'
import { refreshTokens } from '../db/schema'
import { randomToken, sha256 } from './crypto'

export const ACCESS_TTL_SEC = 15 * 60
export const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000
/** 并发刷新的宽限期：多个标签页同时用同一个 refresh token 刷新时，不判定为泄露 */
const REUSE_GRACE_MS = 30 * 1000

const ISSUER = 'tmc'

export async function signAccess(secret: string, userId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(new TextEncoder().encode(secret))
}

/** 返回 userId；无效或过期返回 null */
export async function verifyAccess(secret: string, token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: ISSUER, algorithms: ['HS256'] })
    return payload.sub ?? null
  } catch {
    return null
  }
}

export async function issueRefresh(db: Db, userId: string, device?: string) {
  const token = randomToken()
  const id = uid()
  await db.insert(refreshTokens).values({
    id,
    userId,
    tokenHash: sha256(token),
    device: device?.slice(0, 160),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  })
  return { id, token }
}

export type RotateResult =
  | { ok: true; userId: string; refresh: { id: string; token: string } | null }
  | { ok: false; reason: 'invalid' | 'expired' | 'reused' }

/**
 * 轮换 refresh token：旧的作废，发一个新的。
 * 已作废的 token 被再次使用 → 判定为泄露，作废该用户的全部 refresh token（所有设备需要重新登录）。
 * 例外：刚刚轮换（30 秒内）的 token 再次出现，视为多标签页并发刷新，只发 access token，不发新 refresh。
 */
export async function rotateRefresh(db: Db, token: string, device?: string): Promise<RotateResult> {
  const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(token)))
  if (!row) return { ok: false, reason: 'invalid' }
  if (row.revokedAt) {
    if (row.replacedBy && Date.now() - row.revokedAt.getTime() < REUSE_GRACE_MS) {
      return { ok: true, userId: row.userId, refresh: null }
    }
    await revokeAll(db, row.userId)
    return { ok: false, reason: 'reused' }
  }
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' }

  const next = await issueRefresh(db, row.userId, device)
  await db.update(refreshTokens).set({ revokedAt: new Date(), replacedBy: next.id }).where(eq(refreshTokens.id, row.id))
  return { ok: true, userId: row.userId, refresh: next }
}

export async function revokeToken(db: Db, token: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, sha256(token)), isNull(refreshTokens.revokedAt)))
}

export async function revokeAll(db: Db, userId: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
}
