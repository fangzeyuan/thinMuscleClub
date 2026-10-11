import { dateKey, type Profile } from './plan'
import { initialGame, type GameState, type TrainingSession } from './training'

export type Source = 'app' | 'chat'
export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const SLOT_LABEL: Record<Slot, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }

export interface Meal {
  id: string
  slot: Slot
  text: string
  protein?: number
  kcal?: number
  source: Source
}

/** 睡眠记在"醒来的那一天" */
export interface Sleep {
  bed: string // HH:MM
  wake: string // HH:MM
  quality?: 'good' | 'ok' | 'poor'
  source: Source
}

export interface DayLog {
  water: number // ml
  meals: Meal[]
  sleep?: Sleep
  weight?: number
  waist?: number
  summary?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** 与 OpenAI Chat Completions 消息格式兼容，额外带 UI 字段 */
export interface ChatMsg {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  /** tool 消息：展示给用户的同步标签 */
  label?: string
  error?: boolean
  ts: number
}

export interface AppState {
  v: 3
  profile: Profile | null
  startDate: string | null
  intensity: number
  /** 睡、吃、水、身体数据，按日期存 */
  days: Record<string, DayLog>
  /** 训练记录：单独存，跨天、可进行中，详见 training.ts */
  sessions: TrainingSession[]
  game: GameState
  chat: ChatMsg[]
}

/** 某一天的完整视图：日志 + 当天已完成的训练 */
export type DayView = DayLog & { sessions: TrainingSession[] }

export const initialState = (): AppState => ({ v: 3, profile: null, startDate: null, intensity: 1, days: {}, sessions: [], game: initialGame(), chat: [] })

export const emptyDay = (): DayLog => ({ water: 0, meals: [] })
const rawDay = (s: AppState, date: string): DayLog => s.days[date] ?? emptyDay()
export const getDay = (s: AppState, date: string): DayView => ({
  ...rawDay(s, date),
  sessions: s.sessions.filter((x) => x.status === 'completed' && x.date === date),
})
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

/** 旧版"一条训练 = 标题 + 分钟数"转成训练记录 */
function legacyWorkout(date: string, w: { title: string; minutes: number; kcal?: number; feedback?: 'easy' | 'ok' | 'hard'; source?: string }): TrainingSession {
  const endAt = new Date(date + 'T20:00:00').getTime()
  const guided = w.source !== 'chat'
  return {
    id: uid(),
    activityId: guided ? 'guided' : 'other',
    title: guided ? undefined : w.title,
    facilityId: guided ? 'home' : undefined,
    source: guided ? 'guided' : 'chat',
    status: 'completed',
    startAt: endAt - w.minutes * 60000,
    endAt,
    pausedMs: 0,
    date,
    rpe: w.feedback,
    kcal: w.kcal,
    createdAt: endAt,
    updatedAt: endAt,
  }
}

/** 从旧版本数据迁移到 v3（纯函数，Web 端读取本地数据和服务端导入都用它） */
export function migrateLegacy(v2?: string | null, v1?: string | null): AppState | null {
  if (v2) {
    // v2：DayLog.workouts → sessions
    const o = JSON.parse(v2)
    const sessions: TrainingSession[] = []
    const days: Record<string, DayLog> = {}
    for (const [date, d] of Object.entries<Record<string, unknown> & { workouts?: [] }>(o.days ?? {})) {
      const { workouts = [], ...rest } = d
      for (const w of workouts) sessions.push(legacyWorkout(date, w))
      days[date] = rest as unknown as DayLog
    }
    return { ...initialState(), profile: o.profile, startDate: o.startDate, intensity: o.intensity ?? 1, days, sessions, chat: o.chat ?? [] }
  }
  if (v1) {
    const o = JSON.parse(v1)
    const sessions = (o.logs ?? []).map((l: { date: string; title: string; durationSec: number; kcal?: number; feedback?: 'easy' | 'ok' | 'hard' }) =>
      legacyWorkout(l.date, { title: l.title, minutes: Math.max(1, Math.round(l.durationSec / 60)), kcal: l.kcal, feedback: l.feedback }),
    )
    return { ...initialState(), profile: o.profile, startDate: o.startDate, intensity: o.intensity ?? 1, sessions }
  }
  return null
}

/* ---------------- 数据操作：App 界面和 AI 工具调用共用这一套（训练相关见 training.ts） ---------------- */

type Op = (s: AppState) => AppState

const patchDay = (date: string, fn: (d: DayLog) => DayLog): Op => (s) => ({
  ...s,
  days: { ...s.days, [date]: fn(rawDay(s, date)) },
})

export const ops = {
  setWeight: (date: string, kg: number | undefined) => patchDay(date, (d) => ({ ...d, weight: kg })),
  setWaist: (date: string, cm: number | undefined) => patchDay(date, (d) => ({ ...d, waist: cm })),
  addWater: (date: string, ml: number) => patchDay(date, (d) => ({ ...d, water: Math.max(0, d.water + ml) })),
  setWater: (date: string, ml: number) => patchDay(date, (d) => ({ ...d, water: Math.max(0, ml) })),
  setSleep: (date: string, sleep: Sleep | undefined) => patchDay(date, (d) => ({ ...d, sleep })),
  addMeal: (date: string, meal: Meal) => patchDay(date, (d) => ({ ...d, meals: [...d.meals, meal] })),
  removeMeal: (date: string, id: string) => patchDay(date, (d) => ({ ...d, meals: d.meals.filter((m) => m.id !== id) })),
  setSummary: (date: string, summary: string) => patchDay(date, (d) => ({ ...d, summary })),
}

export function streak(dates: string[], today: string) {
  const set = new Set(dates)
  let n = 0
  const d = new Date(today + 'T00:00:00')
  if (!set.has(today)) d.setDate(d.getDate() - 1)
  while (set.has(dateKey(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}
