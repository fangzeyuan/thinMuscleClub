import { describe, expect, it } from 'vitest'
import { executeTool } from '../src/ai'
import { dayScore, trainProgress } from '../src/pillars'
import type { Profile } from '../src/plan'
import { getDay, initialState, migrateLegacy, uid, type AppState } from '../src/state'
import { activeSession, attributes, avatarStage, facilityLevel, levelOf, sessionMinutes, totalXp, trainingOps } from '../src/training'

const MIN = 60000
const profile: Profile = { sex: 'female', age: 24, height: 162, weight: 56, waist: 72, shape: 'soft', targets: ['abs'], exp: 1, equip: ['none'], days: 4, minutes: 20 }
const base = (): AppState => ({ ...initialState(), profile, startDate: '2026-09-01' })
const t0 = new Date('2026-10-11T18:00:00').getTime()

describe('uid', () => {
  it('生成 26 位、按时间排序的 ULID', () => {
    const a = uid(1000)
    const b = uid(2000)
    expect(a).toHaveLength(26)
    expect(a < b).toBe(true)
    expect(new Set(Array.from({ length: 1000 }, () => uid())).size).toBe(1000)
  })
})

describe('训练计时', () => {
  it('同一时间只能有一条进行中的训练', () => {
    let s = trainingOps.start({ id: 'a', activityId: 'swim', source: 'game', date: '2026-10-11', now: t0 })(base())
    s = trainingOps.start({ id: 'b', activityId: 'run', source: 'game', date: '2026-10-11', now: t0 })(s)
    expect(s.sessions).toHaveLength(1)
  })

  it('时长 = 结束 − 开始 − 暂停；热量按 MET 估算', () => {
    let s = trainingOps.start({ id: 'a', activityId: 'swim', facilityId: 'pool1', source: 'game', date: '2026-10-11', now: t0 })(base())
    s = trainingOps.pause('a', t0 + 20 * MIN)(s)
    s = trainingOps.resume('a', t0 + 30 * MIN)(s)
    s = trainingOps.finish('a', { endAt: t0 + 50 * MIN, rpe: 'ok', weightKg: 56 })(s)
    expect(sessionMinutes(s.sessions[0])).toBe(40)
    expect(s.sessions[0].kcal).toBe(Math.round((7 * 56 * 40) / 60))
    expect(activeSession(s)).toBeUndefined()
  })

  it('暂停状态下直接结束，暂停期间不计时', () => {
    let s = trainingOps.start({ id: 'c', activityId: 'run', source: 'game', date: '2026-10-11', now: t0 })(base())
    s = trainingOps.pause('c', t0 + 15 * MIN)(s)
    s = trainingOps.finish('c', { endAt: t0 + 60 * MIN, weightKg: 56 })(s)
    expect(sessionMinutes(s.sessions[0])).toBe(15)
  })
})

describe('游戏推算', () => {
  const gym = () => {
    let g = base()
    for (let i = 0; i < 3; i++) g = trainingOps.add({ id: 'd' + i, activityId: 'gym_strength', facilityId: 'gym1', source: 'manual', date: '2026-10-11', minutes: 60, weightKg: 56 })(g)
    return g
  }

  it('每日经验封顶 60，少于 5 分钟不计', () => {
    let g = gym()
    expect(totalXp(g)).toBe(60)
    g = trainingOps.add({ id: 'e', activityId: 'yoga', source: 'manual', date: '2026-10-10', minutes: 3, weightKg: 56 })(g)
    expect(totalXp(g)).toBe(60)
  })

  it('等级曲线 50 × (n-1)²', () => {
    expect(levelOf(49).level).toBe(1)
    expect(levelOf(60).level).toBe(2)
    expect(levelOf(200).level).toBe(3)
  })

  it('设施等级和属性由记录推算', () => {
    const g = gym()
    expect(facilityLevel(g, 'gym1')).toMatchObject({ level: 2, minutes: 180 })
    expect(attributes(g)).toMatchObject({ strength: 180, flexibility: 0 })
  })

  it('体型阶段看达标周数，不看训练量', () => {
    let w = base()
    for (const d of ['2026-09-28', '2026-09-29', '2026-10-01', '2026-10-06'])
      w = trainingOps.add({ id: d, activityId: 'run', source: 'manual', date: d, minutes: 30, weightKg: 56 })(w)
    expect(avatarStage(w, 4)).toEqual({ stage: 1, goodWeeks: 1 })
  })

  it('训练日完成训练 → 过程分 +25', () => {
    const d = '2026-10-12' // 周一，训练日
    const before = dayScore(profile, getDay(base(), d), d)
    const after = trainingOps.add({ id: 'f', activityId: 'guided', source: 'guided', date: d, minutes: 20, weightKg: 56 })(base())
    expect(dayScore(profile, getDay(after, d), d) - before).toBe(25)
  })
})

describe('AI 记录训练', () => {
  it('自动关联场景里同类型的设施；未知项目回退为"其他运动"', () => {
    let a = trainingOps.addFacility({ id: 'pool1', kind: 'pool', pos: { x: 2, y: 1 }, createdAt: 0 })(base())
    const apply = (op: (s: AppState) => AppState) => (a = op(a))
    const call = (args: object) => ({ id: 't', type: 'function' as const, function: { name: 'log_workout', arguments: JSON.stringify(args) } })
    executeTool(call({ activity: 'swim', title: '蛙泳', minutes: 45, rpe: 'hard' }), apply, () => a, '2026-10-11')
    expect(a.sessions[0]).toMatchObject({ facilityId: 'pool1', source: 'chat', title: '蛙泳' })
    expect(facilityLevel(a, 'pool1').minutes).toBe(45)
    executeTool(call({ activity: 'teleport', minutes: 20 }), apply, () => a, '2026-10-11')
    expect(a.sessions[1].activityId).toBe('other')
  })
})

describe('旧数据迁移', () => {
  it('v2 → v3：workouts 转为 sessions，其余原样保留', () => {
    const v2 = JSON.stringify({
      v: 2, profile, startDate: '2026-10-01', intensity: 1.1, chat: [{ id: 'x', role: 'user', content: 'hi', ts: 1 }],
      days: {
        '2026-10-05': { water: 1500, meals: [], workouts: [{ id: 'w1', title: '上肢塑形', minutes: 18, kcal: 90, feedback: 'easy', source: 'app' }], weight: 56.2 },
        '2026-10-06': { water: 0, meals: [], workouts: [{ id: 'w2', title: '夜跑', minutes: 30, source: 'chat' }] },
      },
    })
    const m = migrateLegacy(v2)!
    expect(m.v).toBe(3)
    expect(m.sessions).toHaveLength(2)
    const g = m.sessions.find((x) => x.date === '2026-10-05')!
    expect(g).toMatchObject({ activityId: 'guided', facilityId: m.game.facilities[0].id, rpe: 'easy' })
    expect(sessionMinutes(g)).toBe(18)
    expect(m.sessions.find((x) => x.date === '2026-10-06')).toMatchObject({ activityId: 'other', title: '夜跑', source: 'chat' })
    expect(m.days['2026-10-05']).not.toHaveProperty('workouts')
    expect(m).toMatchObject({ intensity: 1.1 })
    expect(m.game.facilities[0].kind).toBe('home')
  })
})

describe('自己安排训练：按本周节奏计算"练"', () => {
  const own: Profile = { ...profile, trainingMode: 'own', days: 4, minutes: 60 }
  const s = (dates: string[]) => {
    let st: AppState = { ...initialState(), profile: own, startDate: '2026-09-01' }
    for (const d of dates) st = trainingOps.add({ id: d, activityId: 'gym_strength', source: 'manual', date: d, minutes: 60, weightKg: 56 })(st)
    return st
  }
  // 2026-10-12 是周一
  it('周一没练不扣分（应练 0 次）', () => {
    expect(trainProgress(own, getDay(s([]), '2026-10-12'), '2026-10-12')).toBe(1)
  })
  it('周三还一次没练：落后，0', () => {
    expect(trainProgress(own, getDay(s([]), '2026-10-14'), '2026-10-14')).toBe(0)
  })
  it('周一练过一次，周三休息：节奏达标，1', () => {
    expect(trainProgress(own, getDay(s(['2026-10-12']), '2026-10-14'), '2026-10-14')).toBe(1)
  })
  it('上周的训练不算进本周', () => {
    expect(getDay(s(['2026-10-09', '2026-10-10']), '2026-10-14').weekTrainedDays).toBe(0)
  })
  it('App 排课的用户不受影响：休息日 = 1，训练日没练 = 0', () => {
    expect(trainProgress(profile, getDay(s([]), '2026-10-14'), '2026-10-14')).toBe(1) // 周三休息
    expect(trainProgress(profile, getDay(s([]), '2026-10-13'), '2026-10-13')).toBe(0) // 周二训练日
  })
})

describe('自己安排训练：本周中途开始计划', () => {
  it('周日注册，当天没练不算落后', () => {
    const own: Profile = { ...profile, trainingMode: 'own', days: 5, minutes: 60 }
    const st: AppState = { ...initialState(), profile: own, startDate: '2026-10-11' } // 周日
    const d = getDay(st, '2026-10-11')
    expect(d.weekElapsedDays).toBe(1)
    expect(trainProgress(own, d, '2026-10-11')).toBe(1) // floor(5 × 1/7) = 0
  })
})
