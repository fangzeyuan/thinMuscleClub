import { describe, expect, it } from 'vitest'
import { energyOn, recentBalance } from '../src/energy'
import { assess, type Profile } from '../src/plan'
import { initialState, type AppState, type DayLog } from '../src/state'
import { trainingOps } from '../src/training'

const female: Profile = { sex: 'female', age: 24, height: 162, weight: 56, waist: 72, shape: 'soft', targets: ['abs'], exp: 1, equip: ['none'], days: 4, minutes: 20 }
const base = (p: Profile = female): AppState => ({ ...initialState(), profile: p, startDate: '2026-10-01' })
const D = '2026-10-11'

describe('热量账本', () => {
  it('休息日：基础代谢 + 日常活动 − 缺口', () => {
    expect(energyOn(base(), D)).toMatchObject({ bmr: 1292, daily: 388, exercise: 0, burn: 1680, adjust: -250, budget: 1430, remaining: 1430 })
  })

  it('测评页日均参考值与每日口径一致（含计划训练折算）', () => {
    expect(assess(female).kcal).toBe(1500)
  })

  it('运动消耗计入预算；未填热量的餐不计入摄入', () => {
    let s = trainingOps.add({ id: 'r', activityId: 'run', source: 'manual', date: D, minutes: 30, weightKg: 56 })(base())
    s = {
      ...s,
      days: {
        [D]: {
          water: 0,
          meals: [
            { id: 'm1', slot: 'lunch', text: '牛肉面', protein: 25, kcal: 600, source: 'app' },
            { id: 'm2', slot: 'dinner', text: '沙拉', protein: 20, source: 'app' },
          ],
        },
      },
    }
    expect(energyOn(s, D)).toMatchObject({ exercise: 252, budget: 1680, intake: 600, unknownMeals: 1, remaining: 1080 })
  })

  it('用最近一次记录的体重算基础代谢', () => {
    const s = { ...base(), days: { '2026-10-09': { water: 0, meals: [], weight: 54 } } }
    expect(energyOn(s, '2026-10-10')).toMatchObject({ weight: 54, bmr: 1272 })
  })

  it('预算保底：不低于基础代谢，也不低于 1200', () => {
    const e = energyOn(base({ ...female, height: 150, weight: 62, age: 40, shape: 'heavy' }), D)
    expect(e.type).toBe('cut')
    expect(e.floored).toBe(true)
    expect(e.budget).toBe(Math.max(1200, e.bmr))
  })

  it('近期平均差只统计记录完整的日子', () => {
    const day = (kcal: number): DayLog => ({
      water: 0,
      meals: [
        { id: 'a', slot: 'lunch', text: 'x', kcal: kcal / 2, source: 'app' },
        { id: 'b', slot: 'dinner', text: 'y', kcal: kcal / 2, source: 'app' },
      ],
    })
    const s = { ...base(), days: { '2026-10-05': day(1400), '2026-10-06': day(1400), '2026-10-07': { water: 0, meals: [{ id: 'c', slot: 'lunch' as const, text: 'z', source: 'app' as const }] } } }
    expect(recentBalance(s, ['2026-10-05', '2026-10-06', '2026-10-07'])).toEqual({ days: 2, avg: -280, kgPerWeek: -0.25 })
  })
})
