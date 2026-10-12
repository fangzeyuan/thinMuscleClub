/**
 * 接口请求体的校验（服务端校验入参；Web / 小程序可复用做表单校验）
 * 时间点统一用毫秒时间戳，日期统一用 YYYY-MM-DD（用户本地日期）。
 */
import { z } from 'zod'
import { ACTIVITIES, FACILITIES } from './data/activities'

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD').refine((d) => !isNaN(Date.parse(d + 'T00:00:00Z')), '日期不合法')
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '时间格式应为 HH:MM')
const ms = z.number().int().positive()
const source = z.enum(['app', 'game', 'guided', 'chat', 'manual'])

export const profileBody = z.object({
  profile: z.object({
    sex: z.enum(['male', 'female']),
    age: z.number().int().min(10).max(100),
    height: z.number().min(100).max(250),
    weight: z.number().min(25).max(250),
    waist: z.number().min(40).max(200).nullable(),
    shape: z.enum(['skinny', 'even', 'soft', 'heavy']),
    targets: z.array(z.enum(['abs', 'shoulder', 'arm', 'glute', 'chest', 'posture'])).min(1).max(3),
    exp: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    equip: z.array(z.enum(['none', 'band', 'dumbbell'])).min(1),
    days: z.number().int().min(1).max(7),
    minutes: z.number().int().min(5).max(300),
    trainingMode: z.enum(['app', 'own']).default('app'),
  }),
  startDate: dateStr,
  intensity: z.number().min(0.7).max(1.4).default(1),
})

/** 部分更新：没传的字段不变；传 null 表示清空 */
export const dayPatchBody = z
  .object({
    sleep: z.object({ bed: hhmm, wake: hhmm, quality: z.enum(['good', 'ok', 'poor']).nullable().optional(), source }).nullable(),
    weightKg: z.number().min(25).max(250).nullable(),
    waistCm: z.number().min(40).max(200).nullable(),
    summary: z.string().max(500).nullable(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, '没有要更新的字段')

export const waterBody = z.object({
  date: dateStr,
  ml: z.number().int().min(-5000).max(5000).refine((n) => n !== 0, 'ml 不能为 0'),
  source,
})

const nutrient = z.number().min(0).max(10000).nullable().optional()

export const mealItemBody = z.object({
  id: z.string().min(1).max(40),
  foodId: z.string().max(60).nullable().optional(),
  name: z.string().min(1).max(60),
  amount: z.number().positive().max(10000),
  unit: z.string().min(1).max(10),
  grams: z.number().positive().max(10000).nullable().optional(),
  kcal: nutrient,
  proteinG: nutrient,
  carbsG: nutrient,
  fatG: nutrient,
  confidence: z.enum(['high', 'medium', 'low']).nullable().optional(),
})

export const mealBody = z.object({
  date: dateStr,
  slot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  eatenAt: ms.nullable().optional(),
  title: z.string().min(1).max(60),
  kcal: nutrient,
  proteinG: nutrient,
  carbsG: nutrient,
  fatG: nutrient,
  inputMethod: z.enum(['chat', 'photo', 'favorite', 'search', 'manual']),
  confidence: z.enum(['high', 'medium', 'low']).nullable().optional(),
  source,
  items: z.array(mealItemBody).max(30).default([]),
})

const activityIds = ACTIVITIES.map((a) => a.id) as [string, ...string[]]

export const sessionBody = z
  .object({
    activityId: z.enum(activityIds),
    title: z.string().max(30).nullable().optional(),
    facilityId: z.string().max(40).nullable().optional(),
    source,
    status: z.enum(['active', 'completed']),
    startAt: ms,
    endAt: ms.nullable().optional(),
    pausedAt: ms.nullable().optional(),
    pausedMs: z.number().int().min(0).default(0),
    date: dateStr,
    rpe: z.enum(['easy', 'ok', 'hard']).nullable().optional(),
    kcal: z.number().int().min(0).max(5000).nullable().optional(),
    details: z.record(z.unknown()).nullable().optional(),
    note: z.string().max(200).nullable().optional(),
  })
  .refine((s) => s.status === 'active' || s.endAt != null, { message: '已完成的训练必须有结束时间', path: ['endAt'] })
  .refine((s) => s.endAt == null || s.endAt >= s.startAt, { message: '结束时间早于开始时间', path: ['endAt'] })
  .refine((s) => s.endAt == null || s.endAt - s.startAt <= 24 * 3600 * 1000, { message: '单次训练不能超过 24 小时', path: ['endAt'] })

const facilityKinds = Object.keys(FACILITIES) as [string, ...string[]]

export const facilityBody = z.object({
  kind: z.enum(facilityKinds),
  name: z.string().max(20).nullable().optional(),
  posX: z.number().int().min(0).max(20),
  posY: z.number().int().min(0).max(20),
})

export const avatarBody = z.object({ skin: z.string().max(30), outfit: z.string().max(30), extra: z.record(z.unknown()).nullable().optional() })

export const foodBody = z.object({
  name: z.string().min(1).max(40),
  aliases: z.array(z.string().max(20)).max(10).default([]),
  category: z.string().min(1).max(20),
  kcal100g: z.number().min(0).max(900),
  protein100g: z.number().min(0).max(100),
  carbs100g: z.number().min(0).max(100),
  fat100g: z.number().min(0).max(100),
  units: z.array(z.object({ unit: z.string().min(1).max(10), grams: z.number().positive().max(5000) })).max(10).default([]),
  defaultUnit: z.string().min(1).max(10),
})

export type ProfileBody = z.infer<typeof profileBody>
export type DayPatchBody = z.infer<typeof dayPatchBody>
export type WaterBody = z.infer<typeof waterBody>
export type MealBody = z.infer<typeof mealBody>
export type SessionBody = z.infer<typeof sessionBody>
export type FacilityBody = z.infer<typeof facilityBody>
export type FoodBody = z.infer<typeof foodBody>
