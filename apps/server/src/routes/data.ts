/**
 * 业务接口（docs/backend-design.md 第 5.2 节）
 *
 * 权限：所有读写都在这里统一带上 req.userId，路由拿不到别人的数据。
 * 幂等：创建和更新都是 PUT /资源/:id（id 由客户端生成），重复提交结果相同。
 * 软删除：DELETE 只标记 deleted_at；对已删除记录再 PUT 返回 410，避免离线队列把删掉的数据"复活"。
 */
import { profileBody, dayPatchBody, waterBody, mealBody, sessionBody, facilityBody, avatarBody, foodBody, dateStr } from '@tmc/core/api'
import { gramsOf, mealKey, nutrientsFor, sumNutrients, type Food, type MealItem, type MealRecord } from '@tmc/core/food'
import type { Facility, TrainingSession } from '@tmc/core/training'
import { and, asc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { z } from 'zod'
import type { Db } from '../db/client'
import { avatars, dayLogs, facilities, foods, mealItems, meals, profiles, trainingSessions, users, waterLogs } from '../db/schema'

/* ---------------- 工具 ---------------- */

export function addDays(date: string, n: number) {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const ms = (d: Date | null | undefined) => (d ? d.getTime() : null)
const toDate = (n: number | null | undefined) => (n == null ? null : new Date(n))

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown, reply: FastifyReply): z.infer<T> | undefined {
  const r = schema.safeParse(body)
  if (r.success) return r.data
  const issue = r.error.issues[0]
  reply.status(400).send({ error: 'bad_request', message: `${issue.path.join('.') || '参数'}：${issue.message}`, issues: r.error.issues })
  return undefined
}

const idOk = (id: string) => /^[A-Za-z0-9_-]{1,40}$/.test(id)

/**
 * PUT 写入失败（没有返回行）时判断原因：别人的记录 → 404；自己已删除 → 410
 * lookup：按 id 查出这条记录的 { userId, deletedAt }
 */
async function explainMiss(lookup: Promise<{ userId: string; deletedAt: Date | null }[]>, userId: string, reply: FastifyReply) {
  const [r] = await lookup
  if (r && r.userId === userId && r.deletedAt) return reply.status(410).send({ error: 'gone', message: '这条记录已经删除' })
  return reply.status(404).send({ error: 'not_found', message: '记录不存在' })
}

/* ---------------- DB ↔ 接口格式 ---------------- */

const sessionDto = (r: typeof trainingSessions.$inferSelect): TrainingSession => ({
  id: r.id,
  activityId: r.activityId,
  title: r.title ?? undefined,
  facilityId: r.facilityId ?? undefined,
  source: r.source as TrainingSession['source'],
  status: r.status,
  startAt: r.startAt.getTime(),
  endAt: ms(r.endAt) ?? undefined,
  pausedAt: ms(r.pausedAt) ?? undefined,
  pausedMs: r.pausedMs,
  date: r.date,
  rpe: (r.rpe as TrainingSession['rpe']) ?? undefined,
  kcal: r.kcal ?? undefined,
  details: (r.details as TrainingSession['details']) ?? undefined,
  note: r.note ?? undefined,
  createdAt: r.createdAt.getTime(),
  updatedAt: r.updatedAt.getTime(),
})

const facilityDto = (r: typeof facilities.$inferSelect): Facility => ({
  id: r.id,
  kind: r.kind as Facility['kind'],
  name: r.name ?? undefined,
  pos: { x: r.posX, y: r.posY },
  createdAt: r.createdAt.getTime(),
})

const dayDto = (r: typeof dayLogs.$inferSelect) => ({
  date: r.date,
  sleep: r.sleepBed && r.sleepWake ? { bed: r.sleepBed.slice(0, 5), wake: r.sleepWake.slice(0, 5), quality: r.sleepQuality, source: r.sleepSource } : null,
  weightKg: r.weightKg,
  waistCm: r.waistCm,
  summary: r.summary,
  updatedAt: r.updatedAt.getTime(),
})

const foodDto = (r: typeof foods.$inferSelect): Food => ({
  id: r.id,
  ownerId: r.ownerId,
  name: r.name,
  aliases: r.aliases,
  category: r.category,
  kcal100g: r.kcal100g,
  protein100g: r.protein100g,
  carbs100g: r.carbs100g,
  fat100g: r.fat100g,
  units: r.units,
  defaultUnit: r.defaultUnit,
  verified: r.verified,
})

function mealDto(r: typeof meals.$inferSelect, items: (typeof mealItems.$inferSelect)[]): MealRecord {
  return {
    id: r.id,
    date: r.date,
    slot: r.slot as MealRecord['slot'],
    eatenAt: ms(r.eatenAt),
    title: r.title,
    kcal: r.kcal,
    proteinG: r.proteinG,
    carbsG: r.carbsG,
    fatG: r.fatG,
    inputMethod: r.inputMethod as MealRecord['inputMethod'],
    confidence: r.confidence as MealRecord['confidence'],
    source: r.source,
    items: items
      .filter((i) => i.mealId === r.id)
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        id: i.id,
        foodId: i.foodId,
        name: i.name,
        amount: i.amount,
        unit: i.unit,
        grams: i.grams,
        kcal: i.kcal,
        proteinG: i.proteinG,
        carbsG: i.carbsG,
        fatG: i.fatG,
        confidence: i.confidence as MealItem['confidence'],
      })),
    updatedAt: r.updatedAt.getTime(),
  }
}

async function loadMeals(db: Db, where: SQL) {
  const rows = await db.select().from(meals).where(where).orderBy(asc(meals.date), asc(meals.createdAt))
  const items = rows.length ? await db.select().from(mealItems).where(inArray(mealItems.mealId, rows.map((r) => r.id))) : []
  return rows.map((r) => mealDto(r, items))
}

/** 一段日期内的全部日数据 */
async function loadDays(db: Db, userId: string, from: string, to: string) {
  const [days, water, mealList, sessions] = await Promise.all([
    db.select().from(dayLogs).where(and(eq(dayLogs.userId, userId), gte(dayLogs.date, from), lte(dayLogs.date, to))),
    db.select().from(waterLogs).where(and(eq(waterLogs.userId, userId), isNull(waterLogs.deletedAt), gte(waterLogs.date, from), lte(waterLogs.date, to))),
    loadMeals(db, and(eq(meals.userId, userId), isNull(meals.deletedAt), gte(meals.date, from), lte(meals.date, to))!),
    db
      .select()
      .from(trainingSessions)
      .where(and(eq(trainingSessions.userId, userId), isNull(trainingSessions.deletedAt), gte(trainingSessions.date, from), lte(trainingSessions.date, to))),
  ])
  return {
    from,
    to,
    days: days.map(dayDto),
    water: water.map((w) => ({ id: w.id, date: w.date, ml: w.ml, source: w.source, createdAt: w.createdAt.getTime() })),
    meals: mealList,
    sessions: sessions.map(sessionDto),
  }
}

/** 用户可见的食物：公共 + 自己的 */
const visibleFood = (userId: string) => and(isNull(foods.deletedAt), or(isNull(foods.ownerId), eq(foods.ownerId, userId)))

/* ---------------- 路由 ---------------- */

export function dataRoutes(app: FastifyInstance, db: Db) {
  const auth = { preHandler: app.authenticate }
  const P = '/api/v1'

  /* ---------- 启动 ---------- */
  app.get(`${P}/bootstrap`, auth, async (req, reply) => {
    const q = req.query as { today?: string }
    const today = parse(dateStr, q.today, reply)
    if (!today) return
    const uidW = req.userId
    const [[user], [profile], [avatar], facs, [active], range] = await Promise.all([
      db.select({ id: users.id, nickname: users.nickname }).from(users).where(eq(users.id, uidW)),
      db.select().from(profiles).where(eq(profiles.userId, uidW)),
      db.select().from(avatars).where(eq(avatars.userId, uidW)),
      db.select().from(facilities).where(and(eq(facilities.userId, uidW), isNull(facilities.deletedAt))),
      db.select().from(trainingSessions).where(and(eq(trainingSessions.userId, uidW), eq(trainingSessions.status, 'active'), isNull(trainingSessions.deletedAt))),
      loadDays(db, uidW, addDays(today, -34), today),
      // 等级、设施等级、体型阶段由全部训练记录推算，所以训练不按日期截断
    ])
    const allSessions = await db
      .select()
      .from(trainingSessions)
      .where(and(eq(trainingSessions.userId, uidW), isNull(trainingSessions.deletedAt)))
      .orderBy(asc(trainingSessions.startAt))
      .limit(5000)
    const year = new Date().getFullYear()
    return {
      user,
      profile: profile
        ? {
            profile: {
              sex: profile.sex,
              age: year - profile.birthYear,
              height: profile.heightCm,
              weight: profile.weightKg,
              waist: profile.waistCm,
              shape: profile.shape,
              targets: profile.targets,
              exp: profile.experience,
              equip: profile.equipment,
              days: profile.daysPerWeek,
              minutes: profile.minutes,
              trainingMode: profile.trainingMode,
            },
            startDate: profile.startDate,
            intensity: profile.intensity,
          }
        : null,
      avatar: avatar ? { skin: avatar.skin, outfit: avatar.outfit, extra: avatar.extra } : null,
      facilities: facs.map(facilityDto),
      activeSession: active ? sessionDto(active) : null,
      ...range,
      sessions: allSessions.map(sessionDto),
    }
  })

  app.get(`${P}/days`, auth, async (req, reply) => {
    const q = req.query as { from?: string; to?: string }
    const from = parse(dateStr, q.from, reply)
    if (!from) return
    const to = parse(dateStr, q.to, reply)
    if (!to) return
    const span = (Date.parse(to) - Date.parse(from)) / 86400000
    if (span < 0 || span > 92) return reply.status(400).send({ error: 'bad_request', message: '日期范围应在 0–92 天之间' })
    return loadDays(db, req.userId, from, to)
  })

  /* ---------- 档案 ---------- */
  app.put(`${P}/profile`, auth, async (req, reply) => {
    const b = parse(profileBody, req.body, reply)
    if (!b) return
    const p = b.profile
    const values = {
      sex: p.sex,
      birthYear: new Date().getFullYear() - p.age,
      heightCm: p.height,
      weightKg: p.weight,
      waistCm: p.waist,
      shape: p.shape,
      targets: p.targets,
      experience: p.exp,
      equipment: p.equip,
      daysPerWeek: p.days,
      minutes: p.minutes,
      trainingMode: p.trainingMode,
      startDate: b.startDate,
      intensity: b.intensity,
      updatedAt: new Date(),
    }
    await db
      .insert(profiles)
      .values({ userId: req.userId, ...values })
      .onConflictDoUpdate({ target: profiles.userId, set: values })
    return { ok: true }
  })

  /* ---------- 每日日志（睡眠 / 体重 / 腰围 / 总结） ---------- */
  app.patch(`${P}/days/:date`, auth, async (req, reply) => {
    const date = parse(dateStr, (req.params as { date: string }).date, reply)
    if (!date) return
    const b = parse(dayPatchBody, req.body, reply)
    if (!b) return
    const set: Partial<typeof dayLogs.$inferInsert> = { updatedAt: new Date() }
    if ('sleep' in b) {
      set.sleepBed = b.sleep?.bed ?? null
      set.sleepWake = b.sleep?.wake ?? null
      set.sleepQuality = b.sleep?.quality ?? null
      set.sleepSource = b.sleep?.source ?? null
    }
    if ('weightKg' in b) set.weightKg = b.weightKg
    if ('waistCm' in b) set.waistCm = b.waistCm
    if ('summary' in b) set.summary = b.summary
    const [row] = await db
      .insert(dayLogs)
      .values({ userId: req.userId, date, ...set })
      .onConflictDoUpdate({ target: [dayLogs.userId, dayLogs.date], set })
      .returning()
    return dayDto(row)
  })

  /* ---------- 喝水（事件） ---------- */
  app.put(`${P}/water/:id`, auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!idOk(id)) return reply.status(400).send({ error: 'bad_request', message: 'id 不合法' })
    const b = parse(waterBody, req.body, reply)
    if (!b) return
    const [row] = await db
      .insert(waterLogs)
      .values({ id, userId: req.userId, ...b })
      .onConflictDoUpdate({ target: waterLogs.id, set: { ...b, updatedAt: new Date() }, setWhere: and(eq(waterLogs.userId, req.userId), isNull(waterLogs.deletedAt)) })
      .returning()
    if (!row) return explainMiss(db.select({ userId: waterLogs.userId, deletedAt: waterLogs.deletedAt }).from(waterLogs).where(eq(waterLogs.id, id)), req.userId, reply)
    return { id: row.id, date: row.date, ml: row.ml, source: row.source, createdAt: row.createdAt.getTime() }
  })

  /* ---------- 饮食 ---------- */
  app.put(`${P}/meals/:id`, auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!idOk(id)) return reply.status(400).send({ error: 'bad_request', message: 'id 不合法' })
    const b = parse(mealBody, req.body, reply)
    if (!b) return

    // 关联食物库的条目：营养数值由服务端按食物库计算（不信任客户端传来的数值）
    const foodIds = [...new Set(b.items.map((i) => i.foodId).filter((x): x is string => !!x))]
    const foodRows = foodIds.length ? await db.select().from(foods).where(and(inArray(foods.id, foodIds), visibleFood(req.userId))) : []
    const foodMap = new Map(foodRows.map((f) => [f.id, foodDto(f)]))
    const missing = foodIds.find((f) => !foodMap.has(f))
    if (missing) return reply.status(400).send({ error: 'unknown_food', message: `食物不存在：${missing}` })

    const items = b.items.map((it, position) => {
      const food = it.foodId ? foodMap.get(it.foodId) : undefined
      const grams = food ? gramsOf(food, it.amount, it.unit) ?? it.grams ?? null : it.grams ?? null
      const n = food && grams != null ? nutrientsFor(food, grams) : { kcal: it.kcal ?? null, proteinG: it.proteinG ?? null, carbsG: it.carbsG ?? null, fatG: it.fatG ?? null }
      return { id: it.id, mealId: id, userId: req.userId, foodId: it.foodId ?? null, name: it.name, amount: it.amount, unit: it.unit, grams, position, confidence: it.confidence ?? null, ...n }
    })
    // 有条目时，整餐数值 = 条目之和
    const totals = items.length ? sumNutrients(items) : { kcal: b.kcal ?? null, proteinG: b.proteinG ?? null, carbsG: b.carbsG ?? null, fatG: b.fatG ?? null }
    const values = {
      date: b.date,
      slot: b.slot,
      eatenAt: toDate(b.eatenAt),
      title: b.title,
      inputMethod: b.inputMethod,
      confidence: b.confidence ?? null,
      source: b.source,
      ...totals,
    }

    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(meals)
        .values({ id, userId: req.userId, ...values })
        .onConflictDoUpdate({ target: meals.id, set: { ...values, updatedAt: new Date() }, setWhere: and(eq(meals.userId, req.userId), isNull(meals.deletedAt)) })
        .returning()
      if (!row) return null
      await tx.delete(mealItems).where(eq(mealItems.mealId, id))
      if (items.length) await tx.insert(mealItems).values(items)
      return row
    })
    if (!result) return explainMiss(db.select({ userId: meals.userId, deletedAt: meals.deletedAt }).from(meals).where(eq(meals.id, id)), req.userId, reply)
    const [meal] = await loadMeals(db, eq(meals.id, id))
    return meal
  })

  /** 常吃：最近 60 天按标题归类计数，返回每类最近一次的完整记录（含条目），点一下即可复制 */
  app.get(`${P}/meals/frequent`, auth, async (req, reply) => {
    const q = req.query as { today?: string; limit?: string }
    const today = parse(dateStr, q.today, reply)
    if (!today) return
    const limit = Math.min(20, Math.max(1, Number(q.limit) || 8))
    const list = await loadMeals(db, and(eq(meals.userId, req.userId), isNull(meals.deletedAt), gte(meals.date, addDays(today, -60)))!)
    const groups = new Map<string, { count: number; meal: MealRecord }>()
    for (const m of list) {
      const k = mealKey(m.title)
      const g = groups.get(k)
      if (g) {
        g.count++
        if (m.date >= g.meal.date) g.meal = m
      } else groups.set(k, { count: 1, meal: m })
    }
    return [...groups.values()].sort((a, b) => b.count - a.count || b.meal.date.localeCompare(a.meal.date)).slice(0, limit)
  })

  /* ---------- 训练 ---------- */
  app.put(`${P}/sessions/:id`, auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!idOk(id)) return reply.status(400).send({ error: 'bad_request', message: 'id 不合法' })
    const b = parse(sessionBody, req.body, reply)
    if (!b) return
    const values = {
      activityId: b.activityId,
      title: b.title ?? null,
      facilityId: b.facilityId ?? null,
      source: b.source,
      status: b.status,
      startAt: new Date(b.startAt),
      endAt: toDate(b.endAt),
      pausedAt: toDate(b.pausedAt),
      pausedMs: b.pausedMs,
      date: b.date,
      rpe: b.rpe ?? null,
      kcal: b.kcal ?? null,
      details: b.details ?? null,
      note: b.note ?? null,
    }
    try {
      const [row] = await db
        .insert(trainingSessions)
        .values({ id, userId: req.userId, ...values })
        .onConflictDoUpdate({
          target: trainingSessions.id,
          set: { ...values, updatedAt: new Date() },
          setWhere: and(eq(trainingSessions.userId, req.userId), isNull(trainingSessions.deletedAt)),
        })
        .returning()
      if (!row) return explainMiss(db.select({ userId: trainingSessions.userId, deletedAt: trainingSessions.deletedAt }).from(trainingSessions).where(eq(trainingSessions.id, id)), req.userId, reply)
      return sessionDto(row)
    } catch (e) {
      // 另一台设备已有进行中的训练（数据库部分唯一索引兜底）
      if (isUniqueViolation(e, 'training_sessions_one_active')) {
        const [other] = await db
          .select()
          .from(trainingSessions)
          .where(and(eq(trainingSessions.userId, req.userId), eq(trainingSessions.status, 'active'), isNull(trainingSessions.deletedAt)))
        return reply.status(409).send({ error: 'active_exists', message: '另一台设备正在训练中', active: other ? sessionDto(other) : null })
      }
      throw e
    }
  })

  /* ---------- 小镇 ---------- */
  app.put(`${P}/facilities/:id`, auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!idOk(id)) return reply.status(400).send({ error: 'bad_request', message: 'id 不合法' })
    const b = parse(facilityBody, req.body, reply)
    if (!b) return
    const values = { kind: b.kind, name: b.name ?? null, posX: b.posX, posY: b.posY }
    const [row] = await db
      .insert(facilities)
      .values({ id, userId: req.userId, ...values })
      .onConflictDoUpdate({ target: facilities.id, set: { ...values, updatedAt: new Date() }, setWhere: and(eq(facilities.userId, req.userId), isNull(facilities.deletedAt)) })
      .returning()
    if (!row) return explainMiss(db.select({ userId: facilities.userId, deletedAt: facilities.deletedAt }).from(facilities).where(eq(facilities.id, id)), req.userId, reply)
    return facilityDto(row)
  })

  app.put(`${P}/avatar`, auth, async (req, reply) => {
    const b = parse(avatarBody, req.body, reply)
    if (!b) return
    const values = { skin: b.skin, outfit: b.outfit, extra: b.extra ?? null, updatedAt: new Date() }
    await db.insert(avatars).values({ userId: req.userId, ...values }).onConflictDoUpdate({ target: avatars.userId, set: values })
    return { ok: true }
  })

  /* ---------- 删除（软删除，统一处理） ---------- */
  const deletable = { water: waterLogs, meals, sessions: trainingSessions, facilities } as const
  for (const [path, table] of Object.entries(deletable)) {
    app.delete(`${P}/${path}/:id`, auth, async (req, reply) => {
      const { id } = req.params as { id: string }
      const t = table as unknown as { id: never; userId: never; deletedAt: never }
      const [row] = await db
        .update(table)
        .set({ deletedAt: new Date(), updatedAt: new Date() } as never)
        .where(and(eq(t.id, id as never), eq(t.userId, req.userId as never)))
        .returning({ id: t.id })
      // 已经删除过也返回 204（幂等）；不存在或属于别人返回 404
      return row ? reply.status(204).send() : reply.status(404).send({ error: 'not_found', message: '记录不存在' })
    })
  }

  /* ---------- 食物库 ---------- */
  app.get(`${P}/foods`, auth, async (req) => {
    const q = req.query as { q?: string; category?: string; limit?: string }
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 20))
    const kw = (q.q ?? '').trim().slice(0, 20)
    const conds = [visibleFood(req.userId)]
    if (q.category) conds.push(eq(foods.category, q.category))
    if (kw) {
      const like = `%${kw.replace(/[%_\\]/g, '\\$&')}%`
      conds.push(or(sql`${foods.name} ilike ${like}`, sql`exists (select 1 from unnest(${foods.aliases}) a where a ilike ${like})`)!)
    }
    const rows = await db.select().from(foods).where(and(...conds)).limit(200)
    // 排序：名称完全匹配 > 别名完全匹配 > 名称开头 > 名称包含 > 别名包含；同级时名字短的（更基础的食物）在前，自定义食物优先
    const rank = (f: typeof foods.$inferSelect) =>
      f.name === kw ? 0 : f.aliases.includes(kw) ? 1 : f.name.startsWith(kw) ? 2 : f.name.includes(kw) ? 3 : 4
    return rows
      .sort((a, b) =>
        kw
          ? rank(a) - rank(b) || a.name.length - b.name.length || (a.ownerId ? 0 : 1) - (b.ownerId ? 0 : 1)
          : a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
      )
      .slice(0, limit)
      .map(foodDto)
  })

  /** 自定义食物：只有本人可见、可改 */
  app.put(`${P}/foods/:id`, auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!idOk(id) || id.startsWith('f_')) return reply.status(400).send({ error: 'bad_request', message: 'id 不合法' })
    const b = parse(foodBody, req.body, reply)
    if (!b) return
    const [row] = await db
      .insert(foods)
      .values({ id, ownerId: req.userId, ...b })
      .onConflictDoUpdate({ target: foods.id, set: { ...b, updatedAt: new Date() }, setWhere: and(eq(foods.ownerId, req.userId), isNull(foods.deletedAt)) })
      .returning()
    if (!row) return reply.status(404).send({ error: 'not_found', message: '记录不存在' })
    return foodDto(row)
  })
}

function isUniqueViolation(e: unknown, constraint: string) {
  const err = e as { code?: string; constraint?: string; message?: string; cause?: { code?: string; constraint?: string; message?: string } }
  const c = err.cause ?? err
  return c.code === '23505' && (c.constraint === constraint || (c.message ?? '').includes(constraint))
}
