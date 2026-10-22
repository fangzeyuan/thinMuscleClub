/**
 * "一天"的边界：凌晨 4 点换天。
 * 00:00–03:59 仍算前一天 —— 凌晨还在记录（夜宵、补记当天）的用户，记录不会落到第二天。
 * App、小镇、AI 教练都用这里的 appToday()，保证各处的"今天"一致。
 */
import { dateKey } from './plan'

export const DAY_START_HOUR = 4

/** 按凌晨 4 点换天计算的"今天"（YYYY-MM-DD） */
export const appToday = (now = new Date()) => dateKey(new Date(now.getTime() - DAY_START_HOUR * 3600 * 1000))

/** 是否处于"凌晨仍算前一天"的时段 */
export const isLateNight = (now = new Date()) => now.getHours() < DAY_START_HOUR

/** 某个日期当天 0 点（本地时间）的 Date */
export const dateAt = (date: string) => new Date(date + 'T00:00:00')

export function addDays(date: string, n: number) {
  const d = dateAt(date)
  d.setDate(d.getDate() + n)
  return dateKey(d)
}

const WD = ['日', '一', '二', '三', '四', '五', '六']

/** 10月18日 周六 */
export const dateLabel = (date: string) => {
  const d = dateAt(date)
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WD[d.getDay()]}`
}
