const pad = (n: number) => String(n).padStart(2, '0')
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** 聊天时间：今天 14:05 / 昨天 14:05 / 周三 14:05 / 10月17日 14:05 / 2025年10月17日 14:05 */
export function chatTime(ts: number, now = new Date()) {
  const d = new Date(ts)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)
  if (days === 0) return hm
  if (days === 1) return `昨天 ${hm}`
  if (days > 1 && days < 7) return `周${'日一二三四五六'[d.getDay()]} ${hm}`
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
}

/** 两条消息之间是否插入时间：第一条、相隔 5 分钟以上、或跨天 */
export const needsTimeDivider = (prev: number | null, ts: number) =>
  prev == null || ts - prev >= 5 * 60 * 1000 || startOfDay(new Date(prev)) !== startOfDay(new Date(ts))
