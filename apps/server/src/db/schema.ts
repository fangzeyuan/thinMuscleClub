/**
 * 数据库表结构（详见 docs/backend-design.md 第 4 节）
 *
 * 约定：
 * - 业务数据的 id 由客户端生成（ULID），PUT 幂等写入
 * - 所有业务表都有 user_id、updated_at、deleted_at（软删除）
 * - 推算数据（经验、等级、过程分、热量账本）不入库
 * - 饮食、聊天、教练笔记的表待"吃"的模型确定后再建
 */
import { sql } from 'drizzle-orm'
import { bigint, date, doublePrecision, index, inet, integer, jsonb, pgTable, primaryKey, text, time, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const createdAt = () => ts('created_at').notNull().defaultNow()
const updatedAt = () => ts('updated_at').notNull().defaultNow()
const deletedAt = () => ts('deleted_at')

/* ---------------- 账号与认证 ---------------- */

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  nickname: text('nickname'),
  timezone: text('timezone').notNull().default('Asia/Shanghai'),
  createdAt: createdAt(),
  deletedAt: deletedAt(),
})

export const authIdentities = pgTable(
  'auth_identities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    kind: text('kind').$type<'phone' | 'email' | 'wechat'>().notNull(),
    value: text('value').notNull(),
    verifiedAt: ts('verified_at').notNull(),
  },
  (t) => [uniqueIndex('auth_identities_kind_value').on(t.kind, t.value), index('auth_identities_user').on(t.userId)],
)

export const verificationCodes = pgTable(
  'verification_codes',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<'phone' | 'email'>().notNull(),
    target: text('target').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: ts('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: ts('consumed_at'),
    ip: inet('ip'),
    createdAt: createdAt(),
  },
  (t) => [index('verification_codes_target').on(t.kind, t.target, t.createdAt)],
)

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    tokenHash: text('token_hash').notNull().unique(),
    device: text('device'),
    createdAt: createdAt(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    replacedBy: text('replaced_by'),
  },
  (t) => [index('refresh_tokens_user').on(t.userId)],
)

export const consents = pgTable(
  'consents',
  {
    userId: text('user_id').notNull().references(() => users.id),
    kind: text('kind').$type<ConsentKind>().notNull(),
    version: text('version').notNull(),
    grantedAt: ts('granted_at').notNull().defaultNow(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.version] })],
)
export type ConsentKind = 'privacy_policy' | 'health_data' | 'ai_processing'

/* ---------------- 档案 ---------------- */

export const profiles = pgTable('profiles', {
  userId: text('user_id').primaryKey().references(() => users.id),
  sex: text('sex').$type<'male' | 'female'>().notNull(),
  birthYear: integer('birth_year').notNull(),
  heightCm: doublePrecision('height_cm').notNull(),
  weightKg: doublePrecision('weight_kg').notNull(),
  waistCm: doublePrecision('waist_cm'),
  shape: text('shape').notNull(),
  targets: text('targets').array().notNull(),
  experience: integer('experience').notNull(),
  equipment: text('equipment').array().notNull(),
  daysPerWeek: integer('days_per_week').notNull(),
  minutes: integer('minutes').notNull(),
  startDate: date('start_date').notNull(),
  intensity: doublePrecision('intensity').notNull().default(1),
  updatedAt: updatedAt(),
})

/* ---------------- 睡 · 水 · 身体 ---------------- */

export const dayLogs = pgTable(
  'day_logs',
  {
    userId: text('user_id').notNull().references(() => users.id),
    date: date('date').notNull(),
    sleepBed: time('sleep_bed'),
    sleepWake: time('sleep_wake'),
    sleepQuality: text('sleep_quality'),
    sleepSource: text('sleep_source'),
    weightKg: doublePrecision('weight_kg'),
    waistCm: doublePrecision('waist_cm'),
    summary: text('summary'),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
)

/** 喝水改为事件：多端同时 +250 不会丢；当天总量 = sum(ml) */
export const waterLogs = pgTable(
  'water_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    date: date('date').notNull(),
    ml: integer('ml').notNull(),
    source: text('source').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('water_logs_user_date').on(t.userId, t.date)],
)

/* ---------------- 训练与小镇 ---------------- */

export const trainingSessions = pgTable(
  'training_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    activityId: text('activity_id').notNull(),
    title: text('title'),
    facilityId: text('facility_id'),
    source: text('source').notNull(),
    status: text('status').$type<'active' | 'completed'>().notNull(),
    startAt: ts('start_at').notNull(),
    endAt: ts('end_at'),
    pausedAt: ts('paused_at'),
    pausedMs: bigint('paused_ms', { mode: 'number' }).notNull().default(0),
    date: date('date').notNull(),
    rpe: text('rpe'),
    kcal: integer('kcal'),
    details: jsonb('details'),
    note: text('note'),
    chatMsgId: text('chat_msg_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('training_sessions_user_date').on(t.userId, t.date),
    // 每个用户同时最多一条进行中的训练（业务规则的数据库兜底）
    uniqueIndex('training_sessions_one_active').on(t.userId).where(sql`${t.status} = 'active' and ${t.deletedAt} is null`),
  ],
)

export const facilities = pgTable(
  'facilities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    kind: text('kind').notNull(),
    name: text('name'),
    posX: integer('pos_x').notNull(),
    posY: integer('pos_y').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('facilities_user').on(t.userId)],
)

export const avatars = pgTable('avatars', {
  userId: text('user_id').primaryKey().references(() => users.id),
  skin: text('skin').notNull().default('default'),
  outfit: text('outfit').notNull().default('default'),
  /** 游戏外观还没定型，扩展字段先放这里 */
  extra: jsonb('extra'),
  updatedAt: updatedAt(),
})
