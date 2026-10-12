/**
 * 训练数据模型
 *
 * 原则：TrainingSession 是唯一数据源。游戏里的角色等级、属性、设施等级、体型阶段
 * 全部由训练记录推算，不单独存储。这样无论记录来自游戏、App 跟练、AI 聊天还是手动补录，
 * 游戏状态都会自动一致；删除一条记录，游戏状态也会随之回退。
 */
import { activityById, type ActivityCategory, type FacilityKind } from './data/activities'
import { uid } from './id'
import { dateKey } from './plan'
import type { AppState, Source } from './state'

export type Rpe = 'easy' | 'ok' | 'hard'
export type SessionSource = 'game' | 'guided' | Source | 'manual'

export interface SessionDetails {
  /** App 跟练会自动填写；场馆训练第一版不要求 */
  exercises?: { exerciseId: string; name: string; sets: { reps?: number; sec?: number }[] }[]
}

export interface TrainingSession {
  id: string
  activityId: string
  /** activityId 为 other 或 AI 记录时的自定义名称 */
  title?: string
  facilityId?: string
  source: SessionSource
  status: 'active' | 'completed'
  /** 时长由时间戳计算，不依赖前台计时器（手机锁屏后网页计时器会暂停） */
  startAt: number
  endAt?: number
  pausedAt?: number
  pausedMs: number
  /** 归属日期，以开始时间为准 */
  date: string
  rpe?: Rpe
  kcal?: number
  details?: SessionDetails
  note?: string
  createdAt: number
  updatedAt: number
}

export interface Facility {
  id: string
  kind: FacilityKind
  name?: string
  /** 等距网格坐标 */
  pos: { x: number; y: number }
  createdAt: number
}

export interface GameState {
  facilities: Facility[]
  avatar: { skin: string; outfit: string }
}

export const initialGame = (): GameState => ({
  facilities: [{ id: uid(), kind: 'home', pos: { x: 3, y: 3 }, createdAt: Date.now() }],
  avatar: { skin: 'default', outfit: 'default' },
})

/* ---------------- 时长与热量 ---------------- */

/** 超过这个时长的训练需要用户确认（多半是忘了结束） */
export const STALE_MS = 3 * 60 * 60 * 1000

export function sessionMs(s: TrainingSession, now = Date.now()) {
  const end = s.endAt ?? (s.pausedAt ?? now)
  return Math.max(0, end - s.startAt - s.pausedMs)
}

export const sessionMinutes = (s: TrainingSession, now?: number) => Math.round(sessionMs(s, now) / 60000)

export const sessionTitle = (s: TrainingSession) => s.title || activityById(s.activityId).name

export function estimateKcal(activityId: string, minutes: number, weightKg: number) {
  return Math.round(activityById(activityId).met * weightKg * (minutes / 60))
}

/* ---------------- 操作（App、游戏、AI 共用） ---------------- */

type Op = (s: AppState) => AppState
const touch = (x: TrainingSession, patch: Partial<TrainingSession>): TrainingSession => ({ ...x, ...patch, updatedAt: Date.now() })
const mapSession = (id: string, fn: (x: TrainingSession) => TrainingSession): Op => (s) => ({
  ...s,
  sessions: s.sessions.map((x) => (x.id === id ? fn(x) : x)),
})

export const trainingOps = {
  /** 开始一次训练。同一时间只允许一条进行中的记录 */
  start:
    (init: { id: string; activityId: string; facilityId?: string; source: SessionSource; date: string; now?: number }): Op =>
    (s) => {
      if (s.sessions.some((x) => x.status === 'active')) return s
      const { now = Date.now(), ...rest } = init
      return { ...s, sessions: [...s.sessions, { ...rest, status: 'active', startAt: now, pausedMs: 0, createdAt: now, updatedAt: now }] }
    },

  pause: (id: string, now = Date.now()) => mapSession(id, (x) => (x.status === 'active' && !x.pausedAt ? touch(x, { pausedAt: now }) : x)),

  resume: (id: string, now = Date.now()) =>
    mapSession(id, (x) => (x.pausedAt ? touch(x, { pausedMs: x.pausedMs + (now - x.pausedAt), pausedAt: undefined }) : x)),

  /** 结束训练。endAt 可以由用户修正（忘记结束的情况） */
  finish: (id: string, opts: { endAt?: number; rpe?: Rpe; weightKg: number; details?: SessionDetails }): Op =>
    mapSession(id, (x) => {
      const endAt = opts.endAt ?? x.pausedAt ?? Date.now()
      const pausedMs = x.pausedAt && endAt > x.pausedAt ? x.pausedMs + (endAt - x.pausedAt) : x.pausedMs
      const done = { ...x, endAt, pausedMs, pausedAt: undefined, status: 'completed' as const }
      return touch(done, { rpe: opts.rpe ?? x.rpe, details: opts.details ?? x.details, kcal: estimateKcal(x.activityId, sessionMinutes(done), opts.weightKg) })
    }),

  /** 放弃一条进行中的记录 */
  discard: (id: string): Op => (s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== id) }),

  /** 直接添加一条已完成的记录（AI 聊天、手动补录） */
  add:
    (init: { id: string; activityId: string; title?: string; facilityId?: string; source: SessionSource; date: string; minutes: number; endAt?: number; rpe?: Rpe; kcal?: number; note?: string; weightKg: number; details?: SessionDetails }): Op =>
    (s) => {
      const endAt = init.endAt ?? Date.now()
      const session: TrainingSession = {
        id: init.id,
        activityId: init.activityId,
        title: init.title,
        facilityId: init.facilityId,
        source: init.source,
        status: 'completed',
        startAt: endAt - init.minutes * 60000,
        endAt,
        pausedMs: 0,
        date: init.date,
        rpe: init.rpe,
        kcal: init.kcal ?? estimateKcal(init.activityId, init.minutes, init.weightKg),
        details: init.details,
        note: init.note,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      return { ...s, sessions: [...s.sessions, session] }
    },

  setRpe: (id: string, rpe: Rpe) => mapSession(id, (x) => touch(x, { rpe })),

  remove: (id: string): Op => (s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== id) }),

  addFacility: (f: Facility): Op => (s) => ({ ...s, game: { ...s.game, facilities: [...s.game.facilities, f] } }),

  moveFacility: (id: string, pos: Facility['pos']): Op => (s) => ({
    ...s,
    game: { ...s.game, facilities: s.game.facilities.map((f) => (f.id === id ? { ...f, pos } : f)) },
  }),

  /** 删除设施不删除训练记录，记录上的 facilityId 会失效但数据保留 */
  removeFacility: (id: string): Op => (s) => ({ ...s, game: { ...s.game, facilities: s.game.facilities.filter((f) => f.id !== id) } }),
}

/* ---------------- 查询 ---------------- */

export const completedSessions = (s: AppState) => s.sessions.filter((x) => x.status === 'completed')
export const sessionsOn = (s: AppState, date: string) => completedSessions(s).filter((x) => x.date === date)
export const activeSession = (s: AppState) => s.sessions.find((x) => x.status === 'active')

/* ---------------- 推算：游戏状态全部由记录得出 ---------------- */

/** 单次最多计入的分钟数，避免"挂机刷时长" */
const MAX_CREDIT_MIN = 90
/** 少于这个时长不计经验 */
const MIN_CREDIT_MIN = 5
/** 每日经验上限：奖励坚持，不奖励过量 */
const DAILY_XP_CAP = 60

const creditedMinutes = (x: TrainingSession) => {
  const m = sessionMinutes(x)
  return m < MIN_CREDIT_MIN ? 0 : Math.min(m, MAX_CREDIT_MIN)
}

/** 单次经验：完成本身 10 分 + 每 2 分钟 1 分 */
const sessionXp = (x: TrainingSession) => (creditedMinutes(x) > 0 ? 10 + Math.floor(Math.min(creditedMinutes(x), 60) / 2) : 0)

export function totalXp(s: AppState) {
  const byDay = new Map<string, number>()
  for (const x of completedSessions(s)) byDay.set(x.date, (byDay.get(x.date) ?? 0) + sessionXp(x))
  let xp = 0
  for (const v of byDay.values()) xp += Math.min(v, DAILY_XP_CAP)
  return xp
}

/** 等级曲线：Lv2 需 50 经验，Lv3 需 200，Lv4 需 450 …（50 × (n-1)²） */
export function levelOf(xp: number) {
  const level = Math.floor(Math.sqrt(xp / 50)) + 1
  const cur = 50 * (level - 1) ** 2
  const next = 50 * level ** 2
  return { level, xp, cur, next, progress: (xp - cur) / (next - cur) }
}

const ATTR_OF: Record<ActivityCategory, 'strength' | 'endurance' | 'flexibility'> = {
  strength: 'strength',
  cardio: 'endurance',
  sport: 'endurance',
  daily: 'endurance',
  flexibility: 'flexibility',
}

/** 角色属性：各类别累计计入分钟数 */
export function attributes(s: AppState) {
  const out = { strength: 0, endurance: 0, flexibility: 0 }
  for (const x of completedSessions(s)) out[ATTR_OF[activityById(x.activityId).category]] += creditedMinutes(x)
  return out
}

const FACILITY_LEVELS = [0, 60, 300, 900, 2000] // 累计分钟

/** 设施等级：按在该设施的累计训练分钟数 */
export function facilityLevel(s: AppState, facilityId: string) {
  const minutes = completedSessions(s)
    .filter((x) => x.facilityId === facilityId)
    .reduce((n, x) => n + creditedMinutes(x), 0)
  let level = 1
  FACILITY_LEVELS.forEach((t, i) => {
    if (minutes >= t) level = i + 1
  })
  const next = FACILITY_LEVELS[level] ?? null
  return { level, minutes, next }
}

/**
 * 角色体型阶段 0–4：看"按计划坚持的周数"，不看训练量。
 * 一周完成计划次数的 75% 记为达标周。镜子还没变化时，角色先变。
 */
export function avatarStage(s: AppState, weeklyTarget: number) {
  const byWeek = new Map<string, Set<string>>()
  for (const x of completedSessions(s)) {
    if (creditedMinutes(x) === 0) continue
    const d = new Date(x.date + 'T00:00:00')
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const wk = dateKey(d)
    if (!byWeek.has(wk)) byWeek.set(wk, new Set())
    byWeek.get(wk)!.add(x.date)
  }
  const goodWeeks = [...byWeek.values()].filter((days) => days.size >= Math.ceil(weeklyTarget * 0.75)).length
  const stage = goodWeeks >= 10 ? 4 : goodWeeks >= 6 ? 3 : goodWeeks >= 3 ? 2 : goodWeeks >= 1 ? 1 : 0
  return { stage, goodWeeks }
}
