import { describe, expect, it } from 'vitest'
import type { Profile } from '../src/plan'
import { initialState, ops, type AppState } from '../src/state'
import { diffState, fromBootstrap, type BootstrapPayload } from '../src/sync'
import { trainingOps } from '../src/training'

const profile: Profile = { sex: 'female', age: 24, height: 162, weight: 56, waist: 72, shape: 'soft', targets: ['abs'], exp: 1, equip: ['none'], days: 4, minutes: 20 }
const D = '2026-10-11'
let n = 0
const newId = () => `W${++n}`

const payload: BootstrapPayload = {
  user: { id: 'u1', nickname: null },
  profile: { profile, startDate: '2026-10-01', intensity: 1.1 },
  avatar: null,
  facilities: [{ id: 'h1', kind: 'home', pos: { x: 3, y: 3 }, createdAt: 1 }],
  activeSession: null,
  from: '2026-09-07',
  to: D,
  days: [{ date: D, sleep: { bed: '23:30', wake: '07:00', quality: 'good', source: 'app' }, weightKg: 55.6, waistCm: null, summary: null }],
  water: [
    { id: 'w1', date: D, ml: 250, source: 'app', createdAt: 1 },
    { id: 'w2', date: D, ml: 500, source: 'chat', createdAt: 2 },
  ],
  meals: [
    {
      id: 'm1', date: D, slot: 'lunch', eatenAt: null, title: '鸡胸肉饭', kcal: 339, proteinG: 34.9, carbsG: 38.9, fatG: 4.1, inputMethod: 'search', confidence: null, source: 'app', updatedAt: 1,
      items: [{ id: 'i1', foodId: 'f_rice', name: '米饭', amount: 1, unit: '碗', grams: 150, kcal: 174, proteinG: 3.9, carbsG: 38.9, fatG: 0.5, confidence: null }],
    },
  ],
  sessions: [{ id: 's1', activityId: 'swim', source: 'game', status: 'completed', startAt: 1000, endAt: 2000, pausedMs: 0, date: D, createdAt: 1, updatedAt: 1 }],
}

describe('服务端数据 → 本地状态', () => {
  it('喝水事件求和、饮食保留条目、空值转为 undefined', () => {
    const s = fromBootstrap(payload)
    expect(s.days[D].water).toBe(750)
    expect(s.days[D].weight).toBe(55.6)
    expect(s.days[D].waist).toBeUndefined()
    expect(s.days[D].meals[0]).toMatchObject({ text: '鸡胸肉饭', kcal: 339, protein: 34.9, inputMethod: 'search' })
    expect(s.days[D].meals[0].items).toHaveLength(1)
    expect(s).toMatchObject({ startDate: '2026-10-01', intensity: 1.1 })
  })

  it('原样转回来不会产生任何请求（不会误覆盖其他设备写的条目）', () => {
    const s = fromBootstrap(payload)
    expect(diffState(s, structuredClone(s), newId)).toEqual([])
  })
})

describe('本地修改 → 接口请求', () => {
  const base = (): AppState => fromBootstrap(payload)

  it('喝水：总量变化转成一条差值事件', () => {
    const s = base()
    expect(diffState(s, ops.addWater(D, 250)(s), newId)).toEqual([expect.objectContaining({ method: 'PUT', path: expect.stringMatching(/^\/water\//), body: { date: D, ml: 250, source: 'app' } })])
    expect(diffState(s, ops.setWater(D, 500)(s), newId)[0].body).toEqual({ date: D, ml: -250, source: 'app' })
  })

  it('睡眠 / 体重：只 PATCH 变化的字段', () => {
    const s = base()
    const calls = diffState(s, ops.setWeight(D, 55.2)(s), newId)
    expect(calls).toEqual([expect.objectContaining({ method: 'PATCH', path: `/days/${D}`, body: { weightKg: 55.2 } })])
    expect(diffState(s, ops.setSleep(D, undefined)(s), newId)[0].body).toEqual({ sleep: null })
  })

  it('饮食：新增 PUT、删除 DELETE；AI 记录的标为 chat', () => {
    const s = base()
    const added = ops.addMeal(D, { id: 'm2', slot: 'dinner', text: '黄焖鸡米饭', kcal: 800, protein: 35, source: 'chat' })(s)
    expect(diffState(s, added, newId)).toEqual([
      expect.objectContaining({ method: 'PUT', path: '/meals/m2', body: expect.objectContaining({ title: '黄焖鸡米饭', kcal: 800, proteinG: 35, inputMethod: 'chat', confidence: 'medium', items: [] }) }),
    ])
    expect(diffState(s, ops.removeMeal(D, 'm1')(s), newId)).toEqual([expect.objectContaining({ method: 'DELETE', path: '/meals/m1' })])
  })

  it('训练：开始 / 结束都是 PUT，并且可以离线排队', () => {
    const s = base()
    const started = trainingOps.start({ id: 's2', activityId: 'run', source: 'game', date: D, now: 5000 })(s)
    const [c] = diffState(s, started, newId)
    expect(c).toMatchObject({ key: 'session:s2', method: 'PUT', path: '/sessions/s2', queueable: true })
    expect(c.body).not.toHaveProperty('id')
    const finished = trainingOps.finish('s2', { endAt: 65000, rpe: 'ok', weightKg: 56 })(started)
    expect(diffState(started, finished, newId)[0].body).toMatchObject({ status: 'completed', endAt: 65000, rpe: 'ok' })
  })

  it('小镇：新增 / 移动设施 PUT，拆除 DELETE；其他资源都不能离线排队', () => {
    const s = base()
    const added = trainingOps.addFacility({ id: 'p1', kind: 'pool', pos: { x: 5, y: 2 }, createdAt: 1 })(s)
    expect(diffState(s, added, newId)[0]).toMatchObject({ path: '/facilities/p1', body: { kind: 'pool', name: null, posX: 5, posY: 2 }, queueable: false })
    expect(diffState(added, trainingOps.moveFacility('p1', { x: 1, y: 1 })(added), newId)[0].body).toMatchObject({ posX: 1, posY: 1 })
    expect(diffState(added, trainingOps.removeFacility('p1')(added), newId)[0]).toMatchObject({ method: 'DELETE', path: '/facilities/p1' })
  })

  it('测评档案：新用户第一次保存', () => {
    const s = initialState()
    const next = { ...s, profile, startDate: D, intensity: 1 }
    expect(diffState(s, next, newId)).toEqual([expect.objectContaining({ method: 'PUT', path: '/profile', body: { profile, startDate: D, intensity: 1 } })])
  })
})
