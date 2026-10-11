import { EXERCISES, WARMUP, type Equip, type Exercise, type Tag } from './data/exercises'

export type Sex = 'male' | 'female'
export type Shape = 'skinny' | 'even' | 'soft' | 'heavy'
export type Target = 'abs' | 'shoulder' | 'arm' | 'glute' | 'chest' | 'posture'
export type Exp = 1 | 2 | 3

export interface Profile {
  sex: Sex
  age: number
  height: number
  weight: number
  waist: number | null
  shape: Shape
  targets: Target[]
  exp: Exp
  equip: Equip[]
  days: 3 | 4 | 5
  minutes: 15 | 20 | 30
}

export type BodyType = 'build' | 'refine' | 'recomp' | 'cut'

export const BODY_TYPE_INFO: Record<BodyType, { name: string; slogan: string; strategy: string }> = {
  build: {
    name: '纤细型',
    slogan: '底子干净，差一点肌肉',
    strategy: '以力量训练为主，吃够蛋白质，轻微热量盈余，先把肌肉"长出来"。',
  },
  refine: {
    name: '准薄肌型',
    slogan: '离薄肌只差临门一脚',
    strategy: '保持当前体重，针对目标部位精雕，小幅热量缺口让线条更清晰。',
  },
  recomp: {
    name: '隐藏线条型',
    slogan: '肌肉在，只是被一层薄脂肪盖住',
    strategy: '力量训练 + 小热量缺口，同时减脂和增肌（身体重组），体重变化不大但会明显变紧致。',
  },
  cut: {
    name: '蓄力型',
    slogan: '先减脂，线条自然会浮现',
    strategy: '燃脂循环 + 力量训练结合，适度热量缺口，优先把体脂降下来。',
  },
}

export const TARGET_INFO: Record<Target, { label: string; desc: string; tags: Tag[] }> = {
  abs: { label: '马甲线 / 腹肌', desc: '平坦紧致的腹部', tags: ['core'] },
  shoulder: { label: '直角肩', desc: '穿衣更有型', tags: ['shoulder', 'posture'] },
  arm: { label: '手臂线条', desc: '告别拜拜肉', tags: ['arm'] },
  glute: { label: '翘臀美腿', desc: '提臀、腿部线条', tags: ['glute', 'leg'] },
  chest: { label: '胸部轮廓', desc: '饱满上半身', tags: ['chest'] },
  posture: { label: '挺拔体态', desc: '改善圆肩驼背', tags: ['posture', 'back'] },
}

/* ---------------- 热量（所有地方共用同一套口径） ---------------- */

/** Mifflin-St Jeor 基础代谢 */
export const bmrOf = (p: Pick<Profile, 'sex' | 'height' | 'age'>, weightKg: number) =>
  Math.round(10 * weightKg + 6.25 * p.height - 5 * p.age + (p.sex === 'male' ? 5 : -161))

/** 日常活动（通勤、走动、做家务）按基础代谢的 30% 估算；以后可接步数替换 */
export const NEAT_RATIO = 0.3

/** 按体型类型的每日热量调整：负数为缺口，正数为盈余 */
export const ENERGY_ADJ: Record<BodyType, number> = { build: 250, refine: -200, recomp: -250, cut: -450 }

/** 预算保底：不低于基础代谢，也不低于 女 1200 / 男 1500 */
export const kcalFloor = (p: Pick<Profile, 'sex'>, bmr: number) => Math.max(bmr, p.sex === 'male' ? 1500 : 1200)

/** App 跟练的代谢当量（与 activities.ts 中 guided 一致） */
const GUIDED_MET = 5

export interface Assessment {
  bmi: number
  bodyFat: number
  targetFat: [number, number]
  type: BodyType
  weeks: number
  kcal: number
  protein: number
  targetWeight: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function assess(p: Profile): Assessment {
  const bmi = p.weight / (p.height / 100) ** 2
  // Deurenberg 公式估算体脂；有腰围时用腰高比修正
  let bf = 1.2 * bmi + 0.23 * p.age - 10.8 * (p.sex === 'male' ? 1 : 0) - 5.4
  if (p.waist) bf += (p.waist / p.height - (p.sex === 'male' ? 0.46 : 0.44)) * 30
  const shapeNudge: Record<Shape, number> = { skinny: -1.5, even: 0, soft: 1.5, heavy: 2 }
  bf = Math.min(45, Math.max(7, bf + shapeNudge[p.shape]))

  const targetFat: [number, number] = p.sex === 'male' ? [11, 15] : [18, 22]
  const mid = (targetFat[0] + targetFat[1]) / 2

  let type: BodyType
  if (bmi < 18.5 || (p.shape === 'skinny' && bf <= targetFat[1] + 2)) type = 'build'
  else if (bf <= targetFat[1] + 1.5) type = 'refine'
  else if (bf <= targetFat[1] + 8 && bmi < 24.5) type = 'recomp'
  else type = 'cut'

  const fatToLose = Math.max(0, ((bf - mid) / 100) * p.weight)
  let weeks: number
  switch (type) {
    case 'build': weeks = 16; break
    case 'refine': weeks = 8; break
    case 'recomp': weeks = clamp(Math.ceil(fatToLose / 0.35) + 4, 10, 20); break
    case 'cut': weeks = clamp(Math.ceil(fatToLose / 0.5) + 2, 12, 24); break
  }
  if (p.days === 3) weeks += 2

  // 参考值：按计划训练量折算的日均预算。每天的实际预算见 energy.ts（按当天真实训练动态计算）
  const bmr = bmrOf(p, p.weight)
  const plannedExercise = (p.days * GUIDED_MET * p.weight * (p.minutes / 60)) / 7
  const kcal = Math.round(Math.max(kcalFloor(p, bmr), bmr * (1 + NEAT_RATIO) + plannedExercise + ENERGY_ADJ[type]) / 50) * 50

  const proteinPerKg: Record<BodyType, number> = { build: 1.8, refine: 1.8, recomp: 2.0, cut: 1.8 }
  const protein = Math.round((p.weight * proteinPerKg[type]) / 5) * 5

  const targetWeight = type === 'build' ? p.weight + 2 : p.weight - fatToLose * 0.8

  return { bmi: round1(bmi), bodyFat: round1(bf), targetFat, type, weeks, kcal, protein, targetWeight: round1(targetWeight) }
}

/* ---------------- 饮食：手掌法则 ---------------- */

export interface PalmGuide {
  protein: number // 掌心
  carbs: number // 拳头
  veg: number // 拳头
  fat: number // 拇指
}

export function palmGuide(p: Profile, a: Assessment): PalmGuide {
  const proteinPalms = Math.max(1, Math.round(a.protein / 3 / 25))
  const carbs = { build: 2, refine: 1.5, recomp: 1, cut: 1 }[a.type]
  return { protein: proteinPalms, carbs, veg: 2, fat: p.sex === 'male' ? 2 : 1 }
}

export const MEAL_TIPS: Record<BodyType, string[]> = {
  build: ['每餐先保证一掌蛋白质，再加一份主食', '训练后 1 小时内吃一顿正餐', '加餐：酸奶 + 坚果 / 香蕉 + 牛奶'],
  refine: ['主食换一半粗粮（糙米、玉米、红薯）', '外卖选"一荤两素"，酱汁单独放', '晚餐主食减半，蛋白质不减'],
  recomp: ['外卖优先：轻食碗、清蒸鱼、卤牛肉', '奶茶换成无糖茶 / 美式', '每餐先吃菜和肉，最后吃主食'],
  cut: ['每餐蔬菜两拳起步，增加饱腹感', '避开油炸和勾芡，选蒸、煮、卤', '零食换成鸡蛋、无糖酸奶、黄瓜'],
}

/* ---------------- 每周安排 ---------------- */

export type DayKind = 'upper' | 'lower' | 'core' | 'posture' | 'full' | 'rest'

export const DAY_INFO: Record<DayKind, { title: string; sub: string; weights: Partial<Record<Tag, number>> }> = {
  upper: { title: '上肢塑形', sub: '肩 · 臂 · 胸 · 背', weights: { shoulder: 3, arm: 3, chest: 2, back: 2 } },
  lower: { title: '臀腿线条', sub: '臀 · 腿 · 核心', weights: { glute: 3, leg: 3, core: 1 } },
  core: { title: '核心燃脂', sub: '腹部 · 心肺', weights: { core: 3, cardio: 2 } },
  posture: { title: '体态激活', sub: '背 · 肩 · 体态', weights: { posture: 3, back: 3, shoulder: 2, core: 1 } },
  full: { title: '全身线条', sub: '全身循环', weights: { leg: 2, core: 2, chest: 1.5, back: 1.5, shoulder: 1, glute: 1, cardio: 1, arm: 1 } },
  rest: { title: '主动恢复', sub: '散步 30 分钟 / 拉伸', weights: {} },
}

// 周一 = 0
const WEEK_TEMPLATES: Record<3 | 4 | 5, Partial<Record<number, DayKind>>> = {
  3: { 0: 'full', 2: 'core', 4: 'full' },
  4: { 0: 'upper', 1: 'lower', 3: 'core', 5: 'full' },
  5: { 0: 'upper', 1: 'lower', 2: 'core', 4: 'posture', 5: 'full' },
}

export function weekSchedule(p: Profile): DayKind[] {
  const t = WEEK_TEMPLATES[p.days]
  return Array.from({ length: 7 }, (_, i) => t[i] ?? 'rest')
}

export const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7

export const PHASES = [
  { name: '适应期', desc: '学会动作、建立习惯，强度偏低' },
  { name: '进阶期', desc: '逐步加量，开始看到体态变化' },
  { name: '塑形期', desc: '解锁进阶动作，线条明显浮现' },
]

export function phaseOf(week: number, totalWeeks: number): number {
  if (week <= 2) return 0
  if (week <= Math.ceil(totalWeeks * 0.6)) return 1
  return 2
}

/* ---------------- 训练生成 ---------------- */

export interface WorkItem {
  ex: Exercise
  amount: number // 次数或秒数
}

export interface Workout {
  kind: DayKind
  title: string
  sub: string
  items: WorkItem[]
  rounds: number
  restSec: number
  roundRestSec: number
  estMin: number
  kcal: number
}

function seeded(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function buildWorkout(p: Profile, kind: DayKind, seed: number, phase: number, intensity: number): Workout {
  const effKind = kind === 'rest' ? 'core' : kind
  const info = DAY_INFO[effKind]
  const rand = seeded(seed * 9973 + 17)
  const targetTags = new Set(p.targets.flatMap((t) => TARGET_INFO[t].tags))
  const maxLevel = clamp(p.exp + (phase >= 2 ? 1 : 0), 1, 3)
  const hasEquip = (e: Equip) => e === 'none' || p.equip.includes(e)

  const pool = EXERCISES.filter((e) => hasEquip(e.equip) && e.level <= maxLevel)
  const score = (e: Exercise) => {
    const w = info.weights
    let s = (w[e.tags[0]] ?? 0) * 1.0 + e.tags.slice(1).reduce((acc, t) => acc + (w[t] ?? 0) * 0.35, 0)
    if (s === 0) return -Infinity
    if (e.tags.some((t) => targetTags.has(t))) s += 1.5
    if (e.equip !== 'none') s += 0.6
    if (e.level === maxLevel) s += 0.3
    return s + rand() * 1.6
  }

  const n = { 15: 4, 20: 5, 30: 6 }[p.minutes]
  const scored = pool.map((e) => ({ e, s: score(e) })).filter((x) => x.s > -Infinity)
  const picked: Exercise[] = []
  const primaryCount: Partial<Record<Tag, number>> = {}
  while (picked.length < n && scored.length) {
    let best = -1
    let bestScore = -Infinity
    scored.forEach((x, i) => {
      const penalty = (primaryCount[x.e.tags[0]] ?? 0) * 2.2
      if (x.s - penalty > bestScore) {
        bestScore = x.s - penalty
        best = i
      }
    })
    const [{ e }] = scored.splice(best, 1)
    picked.push(e)
    primaryCount[e.tags[0]] = (primaryCount[e.tags[0]] ?? 0) + 1
  }

  // 燃脂类动作穿插在中间，避免连续
  picked.sort((a, b) => (a.tags[0] === 'cardio' ? 1 : 0) - (b.tags[0] === 'cardio' ? 1 : 0))
  if (picked.length > 2 && picked[picked.length - 1].tags[0] === 'cardio') {
    const c = picked.pop()!
    picked.splice(Math.floor(picked.length / 2), 0, c)
  }

  const levelFactor = { 1: 0.75, 2: 1, 3: 1.2 }[p.exp]
  const phaseFactor = [0.85, 1, 1.15][phase]
  const f = levelFactor * phaseFactor * intensity
  const items: WorkItem[] = picked.map((ex) => ({
    ex,
    amount: ex.mode === 'time' ? Math.round((ex.base * f) / 5) * 5 : Math.max(6, Math.round(ex.base * f)),
  }))

  const restSec = p.exp === 1 ? 25 : 20
  const roundRestSec = 45
  const workSec = (it: WorkItem) => (it.ex.mode === 'time' ? it.amount : it.amount * 3) * (it.ex.perSide ? 2 : 1)
  const warmSec = WARMUP.reduce((a, w) => a + w.sec, 0)
  const roundSec = items.reduce((a, it) => a + workSec(it) + restSec, 0)
  // 按用户选择的时长反推轮数
  const rounds = clamp(Math.round((p.minutes * 60 - warmSec + roundRestSec) / (roundSec + roundRestSec)), 2, 5)
  const totalSec = warmSec + roundSec * rounds + roundRestSec * (rounds - 1)
  const kcal = Math.round(
    items.reduce((a, it) => a + (it.ex.met * 3.5 * p.weight) / 200 * (workSec(it) / 60), 0) * rounds +
      (3.5 * 3.5 * p.weight) / 200 * (warmSec / 60),
  )

  return {
    kind: effKind,
    title: kind === 'rest' ? '加练 · 核心燃脂' : info.title,
    sub: info.sub,
    items,
    rounds,
    restSec,
    roundRestSec,
    estMin: Math.round(totalSec / 60),
    kcal,
  }
}

/* ---------------- 工具 ---------------- */

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function daysBetween(a: string, b: string) {
  const pa = new Date(a + 'T00:00:00')
  const pb = new Date(b + 'T00:00:00')
  return Math.round((pb.getTime() - pa.getTime()) / 86400000)
}

export interface PlanCtx {
  p: Profile
  a: Assessment
  dayIdx: number
  week: number
  phase: number
  schedule: DayKind[]
  kind: DayKind
  workout: Workout
}
