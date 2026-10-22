import { describe, expect, it } from 'vitest'
import { addDays, appToday, dateLabel, isLateNight } from '../src/day'
import { buildSystemPrompt } from '../src/ai'
import type { Profile } from '../src/plan'
import { initialState } from '../src/state'
import { daysFromPayload } from '../src/sync'

const at = (s: string) => new Date(s) // 本地时间

describe('凌晨 4 点换天', () => {
  it('00:00–03:59 仍算前一天，04:00 起算新的一天', () => {
    expect(appToday(at('2026-10-22T23:59:00'))).toBe('2026-10-22')
    expect(appToday(at('2026-10-23T00:30:00'))).toBe('2026-10-22')
    expect(appToday(at('2026-10-23T03:59:00'))).toBe('2026-10-22')
    expect(appToday(at('2026-10-23T04:00:00'))).toBe('2026-10-23')
    expect(isLateNight(at('2026-10-23T00:30:00'))).toBe(true)
    expect(isLateNight(at('2026-10-23T09:00:00'))).toBe(false)
  })

  it('跨月、跨年也正确', () => {
    expect(appToday(at('2026-11-01T01:00:00'))).toBe('2026-10-31')
    expect(appToday(at('2027-01-01T02:00:00'))).toBe('2026-12-31')
  })

  it('AI 在凌晨知道"今天"仍是前一天', () => {
    const profile: Profile = { sex: 'female', age: 24, height: 162, weight: 56, waist: 72, shape: 'soft', targets: ['abs'], exp: 1, equip: ['none'], days: 4, minutes: 20 }
    const prompt = buildSystemPrompt({ ...initialState(), profile, startDate: '2026-10-01' }, at('2026-10-23T00:30:00'))
    expect(prompt).toContain('今天是 2026-10-22')
    expect(prompt).toContain('现在仍算 2026-10-22')
  })
})

describe('日期工具', () => {
  it('addDays 跨月', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('dateLabel', () => {
    expect(dateLabel('2026-10-18')).toBe('10月18日 周日')
  })
})

describe('按需加载的日数据', () => {
  it('/days 的返回转成本地 DayLog：喝水求和、饮食、睡眠', () => {
    const days = daysFromPayload({
      from: '2026-08-01',
      to: '2026-08-31',
      days: [{ date: '2026-08-03', sleep: { bed: '23:00', wake: '07:00', quality: null, source: 'app' }, weightKg: 56, waistCm: null, summary: null }],
      water: [
        { id: 'a', date: '2026-08-03', ml: 250, source: 'app', createdAt: 1 },
        { id: 'b', date: '2026-08-03', ml: 500, source: 'app', createdAt: 2 },
      ],
      meals: [{ id: 'm', date: '2026-08-04', slot: 'lunch', eatenAt: null, title: '牛肉面', kcal: 600, proteinG: 25, carbsG: null, fatG: null, inputMethod: 'manual', confidence: null, source: 'app', items: [], updatedAt: 1 }],
    })
    expect(days['2026-08-03']).toMatchObject({ water: 750, weight: 56, sleep: { bed: '23:00', wake: '07:00' } })
    expect(days['2026-08-04'].meals[0]).toMatchObject({ text: '牛肉面', kcal: 600 })
  })
})

describe('深夜提醒早点睡', () => {
  const profile: Profile = { sex: 'female', age: 24, height: 162, weight: 56, waist: 72, shape: 'soft', targets: ['abs'], exp: 1, equip: ['none'], days: 4, minutes: 20 }
  const prompt = (t: string) => buildSystemPrompt({ ...initialState(), profile, startDate: '2026-10-01' }, at(t))
  it('23 点以后和凌晨，提示词要求提醒早点睡', () => {
    expect(prompt('2026-10-22T23:15:00')).toContain('提醒早点睡')
    expect(prompt('2026-10-23T01:00:00')).toContain('提醒早点睡')
  })
  it('白天和 22 点不提醒', () => {
    expect(prompt('2026-10-22T14:00:00')).not.toContain('提醒早点睡')
    expect(prompt('2026-10-22T22:59:00')).not.toContain('提醒早点睡')
  })
})
