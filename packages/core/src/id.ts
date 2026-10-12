/**
 * ULID：时间有序 + 随机，客户端离线也能生成全局唯一 ID（服务端用同一个 ID 幂等写入）
 * 前 10 位是毫秒时间戳，后 16 位随机，Crockford Base32
 */
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export function uid(now = Date.now()) {
  let t = ''
  for (let i = 0, n = now; i < 10; i++, n = Math.floor(n / 32)) t = B32[n % 32] + t
  const rand = crypto.getRandomValues(new Uint8Array(16))
  let r = ''
  for (const b of rand) r += B32[b % 32]
  return t + r
}
