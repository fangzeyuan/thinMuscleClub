import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/** 6 位数字验证码 */
export const randomCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

/** Refresh token 原文：只返回给客户端一次，数据库里只存哈希 */
export const randomToken = () => randomBytes(32).toString('base64url')

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** 验证码哈希：带 pepper，并绑定 kind + target，同一个验证码不能用在别的账号上 */
export const hashCode = (pepper: string, kind: string, target: string, code: string) =>
  createHmac('sha256', pepper).update(`${kind}:${target}:${code}`).digest('hex')

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
