import { assess, dateKey, usesAppPlan, weekSchedule, weekdayIndex, type Profile } from './plan'
import { getDay, type AppState, type DayLog, type DayView, type Sleep } from './state'

export type Pillar = 'sleep' | 'train' | 'eat' | 'water'

export const PILLARS: { k: Pillar; name: string; icon: string; color: string }[] = [
  { k: 'sleep', name: '睡', icon: '☾', color: '#7b8cf0' },
  { k: 'train', name: '练', icon: '◆', color: '#13b885' },
  { k: 'eat', name: '吃', icon: '●', color: '#ff8a65' },
  { k: 'water', name: '水', icon: '◗', color: '#3aa8e8' },
]

export interface Targets {
  sleepH: number
  water: number
  protein: number
  kcal: number
}

export function targets(p: Profile): Targets {
  const a = assess(p)
  return { sleepH: 7.5, water: Math.round((p.weight * 35) / 250) * 250, protein: a.protein, kcal: a.kcal }
}

export function sleepHours(s?: Sleep): number | null {
  if (!s) return null
  const [bh, bm] = s.bed.split(':').map(Number)
  const [wh, wm] = s.wake.split(':').map(Number)
  let mins = wh * 60 + wm - (bh * 60 + bm)
  if (mins <= 0) mins += 24 * 60
  return Math.round((mins / 60) * 10) / 10
}

export const dayProtein = (d: DayLog) => d.meals.reduce((a, m) => a + (m.protein ?? 0), 0)
export const dayKcal = (d: DayLog) => d.meals.reduce((a, m) => a + (m.kcal ?? 0), 0)

export const isTrainingDay = (p: Profile, date: string) => weekSchedule(p)[weekdayIndex(new Date(date + 'T00:00:00'))] !== 'rest'

/**
 * "练"的完成度：
 * - App 排课：训练日练了 = 1；休息日按计划休息也算 1
 * - 自己安排：没有课表，按本周节奏算。比如每周 4 次，截至周一 / 三 / 五 / 日分别应练 0 / 1 / 2 / 4 次（向下取整，宽松一些）；
 *   今天练了，或本周已经跟上节奏（休息不扣分）= 1，落后 = 0。
 *   本周中途开始计划的，从开始那天算起（周日注册不会被要求"本周已练 4 次"）
 */
export function trainProgress(p: Profile, d: DayView, date: string) {
  if (d.sessions.length > 0) return 1
  if (usesAppPlan(p)) return isTrainingDay(p, date) ? 0 : 1
  const expected = Math.floor((p.days * d.weekElapsedDays) / 7)
  return d.weekTrainedDays >= expected ? 1 : 0
}

/** 各支柱完成度 0–1。只衡量“可控的过程”，不看体重。 */
export function pillarProgress(p: Profile, d: DayView, date: string): Record<Pillar, number | null> {
  const t = targets(p)
  const h = sleepHours(d.sleep)
  return {
    sleep: h === null ? null : Math.min(1, h / t.sleepH),
    train: trainProgress(p, d, date),
    eat: d.meals.length === 0 ? null : Math.min(1, dayProtein(d) / t.protein),
    water: d.water === 0 ? null : Math.min(1, d.water / t.water),
  }
}

export function dayScore(p: Profile, d: DayView, date: string) {
  const pr = pillarProgress(p, d, date)
  return Math.round(Object.values(pr).reduce<number>((a, v) => a + (v ?? 0), 0) * 25)
}

export function lastNDates(n: number, end = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end)
    d.setDate(end.getDate() - (n - 1 - i))
    return dateKey(d)
  })
}

/** 体重 7 日滑动平均，减少每日波动带来的焦虑 */
export function weightSeries(s: AppState, dates: string[]) {
  const all = Object.entries(s.days)
    .filter(([, d]) => d.weight != null)
    .map(([k, d]) => ({ date: k, w: d.weight! }))
    .sort((a, b) => a.date.localeCompare(b.date))
  return dates.map((date) => {
    const raw = getDay(s, date).weight ?? null
    const t = new Date(date + 'T00:00:00').getTime()
    const win = all.filter((x) => {
      const dt = (t - new Date(x.date + 'T00:00:00').getTime()) / 86400000
      return dt >= 0 && dt < 7
    })
    const avg = win.length ? Math.round((win.reduce((a, x) => a + x.w, 0) / win.length) * 10) / 10 : null
    return { date, raw, avg }
  })
}

/** 预期时间线：告诉用户“现在看不到变化是正常的” */
export const EXPECTATIONS = [
  { week: 1, title: '第 1–2 周 · 神经适应', body: '动作越来越熟练，力量先涨。镜子里几乎看不出变化，这很正常，肌肉还在"学习"。', visible: '自己能感觉到：精神变好、睡得更沉' },
  { week: 3, title: '第 3–4 周 · 身体开始回应', body: '7 日平均体重或腰围开始缓慢移动，每周 0.2–0.5 kg 就是理想速度。', visible: '数据能看到：腰围、7 日平均体重' },
  { week: 6, title: '第 6–8 周 · 自己看得见', body: '衣服变松，肩背和腰腹的轮廓在好光线下开始显现。', visible: '自己看得见：对比照片、衣服尺码' },
  { week: 10, title: '第 10 周以后 · 别人看得见', body: '线条稳定，朋友开始问你"是不是练了"。', visible: '别人看得见' },
]

export function expectationIndex(week: number) {
  let i = 0
  EXPECTATIONS.forEach((e, idx) => {
    if (week >= e.week) i = idx
  })
  return i
}
