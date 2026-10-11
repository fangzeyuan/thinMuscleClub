/**
 * 热量账本：每天按真实数据动态计算
 *
 *   今日消耗 = 基础代谢 + 日常活动 + 运动消耗（训练记录）
 *   今日预算 = max(保底, 今日消耗 + 目标调整)
 *   剩余     = 预算 − 已摄入
 *
 * 运动消耗只来自训练记录，基础部分不含运动，所以不会重复计算。
 */
import { ENERGY_ADJ, NEAT_RATIO, assess, bmrOf, kcalFloor, type BodyType } from './plan'
import { getDay, type AppState } from './state'
import { estimateKcal, sessionMinutes } from './training'

export interface Energy {
  weight: number
  bmr: number
  daily: number
  exercise: number
  burn: number
  adjust: number
  type: BodyType
  budget: number
  floored: boolean
  intake: number
  /** 没有填写热量的餐数（这部分摄入没算进去） */
  unknownMeals: number
  remaining: number
}

/** 截至某天最近一次记录的体重，没有记录则用测评体重 */
export function latestWeight(s: AppState, date: string) {
  const dates = Object.keys(s.days)
    .filter((d) => d <= date && s.days[d].weight != null)
    .sort()
  return dates.length ? s.days[dates[dates.length - 1]].weight! : s.profile!.weight
}

export function energyOn(s: AppState, date: string): Energy {
  const p = s.profile!
  const d = getDay(s, date)
  const weight = latestWeight(s, date)
  const bmr = bmrOf(p, weight)
  const daily = Math.round(bmr * NEAT_RATIO)
  const exercise = d.sessions.reduce((n, x) => n + (x.kcal ?? estimateKcal(x.activityId, sessionMinutes(x), weight)), 0)
  const burn = bmr + daily + exercise
  const type = assess({ ...p, weight }).type
  const adjust = ENERGY_ADJ[type]
  const floor = kcalFloor(p, bmr)
  const raw = Math.round((burn + adjust) / 10) * 10
  const budget = Math.max(floor, raw)
  const intake = d.meals.reduce((n, m) => n + (m.kcal ?? 0), 0)
  return {
    weight,
    bmr,
    daily,
    exercise,
    burn,
    adjust,
    type,
    budget,
    floored: budget > raw,
    intake,
    unknownMeals: d.meals.filter((m) => !m.kcal).length,
    remaining: budget - intake,
  }
}

/** 1 kg 脂肪约 7700 千卡 */
const KCAL_PER_KG = 7700

/**
 * 近几天的平均热量差（摄入 − 消耗），只统计"饮食记录完整"的日子：
 * 至少 2 餐、且每餐都填了热量。用于把"看不见的进展"换算成脂肪。
 */
export function recentBalance(s: AppState, dates: string[]) {
  const valid = dates.filter((date) => {
    const d = getDay(s, date)
    return d.meals.length >= 2 && d.meals.every((m) => m.kcal)
  })
  if (valid.length < 2) return null
  const deltas = valid.map((date) => {
    const e = energyOn(s, date)
    return e.intake - e.burn
  })
  const avg = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length)
  return { days: valid.length, avg, kgPerWeek: Math.round(((avg * 7) / KCAL_PER_KG) * 100) / 100 }
}
