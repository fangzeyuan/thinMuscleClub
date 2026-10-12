/**
 * 客户端 ↔ 服务端同步（在线为主）
 *
 * 客户端照常用 ops 修改本地 AppState（App 界面、小镇、AI 工具都一样），
 * 然后用 diffState(上次已同步的状态, 当前状态) 算出需要调用的接口。
 * 好处：所有入口自动持久化，不需要逐个改调用点。
 */
import type { MealRecord } from './food'
import { uid } from './id'
import type { Profile } from './plan'
import { emptyDay, initialState, type AppState, type ChatMsg, type DayLog, type Meal, type Sleep } from './state'
import type { Facility, GameState, TrainingSession } from './training'

/* ---------------- 服务端返回的格式 ---------------- */

export interface DayDto {
  date: string
  sleep: { bed: string; wake: string; quality: string | null; source: string | null } | null
  weightKg: number | null
  waistCm: number | null
  summary: string | null
}

export interface WaterDto {
  id: string
  date: string
  ml: number
  source: string
  createdAt: number
}

export interface BootstrapPayload {
  user: { id: string; nickname: string | null }
  profile: { profile: Profile; startDate: string; intensity: number } | null
  avatar: { skin: string; outfit: string } | null
  facilities: Facility[]
  activeSession: TrainingSession | null
  from: string
  to: string
  days: DayDto[]
  water: WaterDto[]
  meals: MealRecord[]
  /** 全部训练记录（等级由全部记录推算） */
  sessions: TrainingSession[]
}

/* ---------------- 服务端 → 本地 ---------------- */

const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v)

export function mealFromRecord(m: MealRecord): Meal {
  return {
    id: m.id,
    slot: m.slot,
    text: m.title,
    kcal: opt(m.kcal),
    protein: opt(m.proteinG),
    carbsG: opt(m.carbsG),
    fatG: opt(m.fatG),
    source: m.source === 'chat' ? 'chat' : 'app',
    inputMethod: m.inputMethod,
    confidence: opt(m.confidence),
    items: m.items.length ? m.items : undefined,
  }
}

export function fromBootstrap(b: BootstrapPayload, chat: ChatMsg[] = []): AppState {
  const days: Record<string, DayLog> = {}
  const day = (date: string) => (days[date] ??= emptyDay())
  for (const d of b.days) {
    const x = day(d.date)
    if (d.sleep) x.sleep = { bed: d.sleep.bed, wake: d.sleep.wake, quality: opt(d.sleep.quality) as Sleep['quality'], source: d.sleep.source === 'chat' ? 'chat' : 'app' }
    x.weight = opt(d.weightKg)
    x.waist = opt(d.waistCm)
    x.summary = opt(d.summary)
  }
  for (const w of b.water) day(w.date).water += w.ml
  for (const m of b.meals) day(m.date).meals.push(mealFromRecord(m))

  const base = initialState()
  const game: GameState = {
    facilities: b.facilities,
    avatar: b.avatar ? { skin: b.avatar.skin, outfit: b.avatar.outfit } : base.game.avatar,
  }
  return {
    ...base,
    profile: b.profile?.profile ?? null,
    startDate: b.profile?.startDate ?? null,
    intensity: b.profile?.intensity ?? 1,
    days,
    sessions: b.sessions,
    game,
    chat,
  }
}

/* ---------------- 本地 → 接口请求体 ---------------- */

export function mealToBody(date: string, m: Meal) {
  return {
    date,
    slot: m.slot,
    title: m.text.slice(0, 60),
    kcal: m.kcal ?? null,
    proteinG: m.protein ?? null,
    carbsG: m.carbsG ?? null,
    fatG: m.fatG ?? null,
    inputMethod: m.inputMethod ?? (m.source === 'chat' ? 'chat' : 'manual'),
    confidence: m.confidence ?? (m.source === 'chat' ? 'medium' : null),
    source: m.source,
    items: m.items ?? [],
  }
}

export function sessionToBody(s: TrainingSession) {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = s
  void _id, void _c, void _u
  return rest
}

export const facilityToBody = (f: Facility) => ({ kind: f.kind, name: f.name ?? null, posX: f.pos.x, posY: f.pos.y })

/* ---------------- 差异 → 接口调用 ---------------- */

export interface SyncCall {
  /** 同一资源的唯一键：离线队列里同一个 key 只保留最后一次 */
  key: string
  method: 'PUT' | 'PATCH' | 'DELETE'
  path: string
  body?: unknown
  /** 断网时能否先排队（在线为主：只有训练计时和测评档案可以；两者都是整条覆盖，重放安全） */
  queueable: boolean
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function byId<T extends { id: string }>(list: T[]) {
  return new Map(list.map((x) => [x.id, x]))
}

/** 列表型资源：新增或变化 → PUT，消失 → DELETE */
function diffList<T extends { id: string }>(prev: T[], next: T[], kind: string, path: string, toBody: (x: T) => unknown, queueable = false): SyncCall[] {
  const calls: SyncCall[] = []
  const before = byId(prev)
  const after = byId(next)
  for (const [id, x] of after) {
    const old = before.get(id)
    if (!old || !same(toBody(old), toBody(x))) calls.push({ key: `${kind}:${id}`, method: 'PUT', path: `${path}/${id}`, body: toBody(x), queueable })
  }
  for (const id of before.keys()) if (!after.has(id)) calls.push({ key: `${kind}:${id}`, method: 'DELETE', path: `${path}/${id}`, queueable })
  return calls
}

export function diffState(prev: AppState, next: AppState, newId: () => string = uid): SyncCall[] {
  const calls: SyncCall[] = []

  // 档案（测评、开始日期、强度）
  const profileOf = (s: AppState) => (s.profile && s.startDate ? { profile: s.profile, startDate: s.startDate, intensity: s.intensity } : null)
  const np = profileOf(next)
  // 测评档案也可以排队：填完的测评丢了代价很大，而且 PUT 是整条覆盖，重放安全
  if (np && !same(profileOf(prev), np)) calls.push({ key: 'profile', method: 'PUT', path: '/profile', body: np, queueable: true })

  // 每天：睡眠 / 体重 / 腰围 / 总结 → PATCH；喝水 → 差值事件；饮食 → 列表
  const dates = new Set([...Object.keys(prev.days), ...Object.keys(next.days)])
  for (const date of [...dates].sort()) {
    const a = prev.days[date] ?? emptyDay()
    const b = next.days[date] ?? emptyDay()
    const patch: Record<string, unknown> = {}
    if (!same(a.sleep, b.sleep)) patch.sleep = b.sleep ? { bed: b.sleep.bed, wake: b.sleep.wake, quality: b.sleep.quality ?? null, source: b.sleep.source } : null
    if (a.weight !== b.weight) patch.weightKg = b.weight ?? null
    if (a.waist !== b.waist) patch.waistCm = b.waist ?? null
    if (a.summary !== b.summary) patch.summary = b.summary ?? null
    if (Object.keys(patch).length) calls.push({ key: `day:${date}:${Object.keys(patch).join(',')}`, method: 'PATCH', path: `/days/${date}`, body: patch, queueable: false })

    const delta = b.water - a.water
    if (delta !== 0) {
      const id = newId()
      calls.push({ key: `water:${id}`, method: 'PUT', path: `/water/${id}`, body: { date, ml: delta, source: 'app' }, queueable: false })
    }

    calls.push(...diffList(a.meals, b.meals, 'meal', '/meals', (m) => mealToBody(date, m)))
  }

  // 训练：断网时可以排队（断网也要能计时）
  calls.push(...diffList(prev.sessions, next.sessions, 'session', '/sessions', sessionToBody, true))
  calls.push(...diffList(prev.game.facilities, next.game.facilities, 'facility', '/facilities', facilityToBody))
  if (!same(prev.game.avatar, next.game.avatar)) calls.push({ key: 'avatar', method: 'PUT', path: '/avatar', body: next.game.avatar, queueable: false })

  return calls
}
