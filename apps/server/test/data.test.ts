import { uid } from '@tmc/core/state'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { signAccess } from '../src/auth/tokens'
import { openDb, type Db } from '../src/db/client'
import { users } from '../src/db/schema'
import { seedFoods } from '../src/db/seed'
import { loadEnv } from '../src/env'

const env = loadEnv({ NODE_ENV: 'test', DATABASE_URL: 'pglite://memory', JWT_SECRET: 'test-secret-test-secret-test-secret!!', CODE_PEPPER: 'test-pepper-123456' })
let db: Db
let close: () => Promise<void>
let app: Awaited<ReturnType<typeof buildApp>>

beforeAll(async () => {
  ;({ db, close } = await openDb(env.DATABASE_URL))
  await seedFoods(db)
  app = await buildApp({ env, db, logger: false })
})
afterAll(async () => {
  await app.close()
  await close()
})

/** 建一个用户，返回带登录态的请求函数 */
async function user() {
  const id = uid()
  await db.insert(users).values({ id })
  const token = await signAccess(env.JWT_SECRET, id)
  const call = (method: 'GET' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, payload, headers: { authorization: `Bearer ${token}` } })
  return { id, call }
}

const D = '2026-10-11'
const profile = { sex: 'female', age: 24, height: 162, weight: 56, waist: 72, shape: 'soft', targets: ['abs'], exp: 1, equip: ['none'], days: 4, minutes: 20 }
const t0 = Date.parse('2026-10-11T10:00:00Z')
const session = (over: object = {}) => ({ activityId: 'swim', source: 'game', status: 'active', startAt: t0, pausedMs: 0, date: D, ...over })

describe('权限隔离', () => {
  it('未登录一律 401', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/v1/bootstrap?today=${D}` })).statusCode).toBe(401)
    expect((await app.inject({ method: 'PUT', url: '/api/v1/water/x', payload: { date: D, ml: 250, source: 'app' } })).statusCode).toBe(401)
  })

  it('B 不能读、改、删 A 的记录', async () => {
    const a = await user()
    const b = await user()
    const id = uid()
    expect((await a.call('PUT', `/meals/${id}`, { date: D, slot: 'lunch', title: 'A 的午饭', kcal: 600, inputMethod: 'manual', source: 'app' })).statusCode).toBe(200)

    const overwrite = await b.call('PUT', `/meals/${id}`, { date: D, slot: 'lunch', title: 'B 想覆盖', kcal: 1, inputMethod: 'manual', source: 'app' })
    expect(overwrite.statusCode).toBe(404)
    expect((await b.call('DELETE', `/meals/${id}`)).statusCode).toBe(404)
    expect((await b.call('GET', `/days?from=${D}&to=${D}`)).json().meals).toEqual([])

    const mine = (await a.call('GET', `/days?from=${D}&to=${D}`)).json().meals
    expect(mine).toHaveLength(1)
    expect(mine[0].title).toBe('A 的午饭')
  })
})

describe('档案与每日日志', () => {
  it('档案：年龄存为出生年，读回来还是年龄', async () => {
    const u = await user()
    expect((await u.call('PUT', '/profile', { profile, startDate: '2026-10-01', intensity: 1.1 })).statusCode).toBe(200)
    const boot = (await u.call('GET', `/bootstrap?today=${D}`)).json()
    expect(boot.profile).toEqual({ profile: { ...profile, trainingMode: 'app' }, startDate: '2026-10-01', intensity: 1.1 })
  })

  it('自己有训练计划：保存训练方式，每周天数和时长可以超出排课选项', async () => {
    const u = await user()
    const own = { ...profile, trainingMode: 'own', days: 6, minutes: 90 }
    expect((await u.call('PUT', '/profile', { profile: own, startDate: '2026-10-01' })).statusCode).toBe(200)
    expect((await u.call('GET', `/bootstrap?today=${D}`)).json().profile.profile).toMatchObject({ trainingMode: 'own', days: 6, minutes: 90 })
    expect((await u.call('PUT', '/profile', { profile: { ...own, days: 8 }, startDate: '2026-10-01' })).statusCode).toBe(400)
  })

  it('PATCH 只改传了的字段；null 表示清空', async () => {
    const u = await user()
    await u.call('PATCH', `/days/${D}`, { sleep: { bed: '23:30', wake: '07:15', quality: 'good', source: 'app' }, weightKg: 55.6 })
    await u.call('PATCH', `/days/${D}`, { summary: '今天不错' })
    let day = (await u.call('GET', `/days?from=${D}&to=${D}`)).json().days[0]
    expect(day).toMatchObject({ sleep: { bed: '23:30', wake: '07:15', quality: 'good' }, weightKg: 55.6, summary: '今天不错' })
    await u.call('PATCH', `/days/${D}`, { weightKg: null })
    day = (await u.call('GET', `/days?from=${D}&to=${D}`)).json().days[0]
    expect(day.weightKg).toBeNull()
    expect(day.sleep.bed).toBe('23:30')
  })

  it('校验：非法日期、时间、数值返回 400', async () => {
    const u = await user()
    expect((await u.call('PATCH', '/days/2026-13-01', { weightKg: 50 })).statusCode).toBe(400)
    expect((await u.call('PATCH', `/days/${D}`, { sleep: { bed: '25:00', wake: '07:00', source: 'app' } })).statusCode).toBe(400)
    expect((await u.call('PATCH', `/days/${D}`, { weightKg: 5 })).statusCode).toBe(400)
    expect((await u.call('PATCH', `/days/${D}`, {})).statusCode).toBe(400)
  })
})

describe('喝水（事件）', () => {
  it('多端同时 +250 两次都保留；重复提交同一个 id 不会重复', async () => {
    const u = await user()
    const id1 = uid()
    await u.call('PUT', `/water/${id1}`, { date: D, ml: 250, source: 'app' })
    await u.call('PUT', `/water/${id1}`, { date: D, ml: 250, source: 'app' }) // 网络重试
    await u.call('PUT', `/water/${uid()}`, { date: D, ml: 250, source: 'app' }) // 另一台设备
    const water = (await u.call('GET', `/days?from=${D}&to=${D}`)).json().water
    expect(water.reduce((s: number, w: { ml: number }) => s + w.ml, 0)).toBe(500)
  })

  it('删除后再 PUT 返回 410，不会"复活"', async () => {
    const u = await user()
    const id = uid()
    await u.call('PUT', `/water/${id}`, { date: D, ml: 250, source: 'app' })
    expect((await u.call('DELETE', `/water/${id}`)).statusCode).toBe(204)
    expect((await u.call('DELETE', `/water/${id}`)).statusCode).toBe(204) // 幂等
    expect((await u.call('PUT', `/water/${id}`, { date: D, ml: 250, source: 'app' })).statusCode).toBe(410)
    expect((await u.call('GET', `/days?from=${D}&to=${D}`)).json().water).toEqual([])
  })
})

describe('饮食', () => {
  it('关联食物库的条目由服务端计算营养；整餐 = 条目之和', async () => {
    const u = await user()
    const id = uid()
    const res = await u.call('PUT', `/meals/${id}`, {
      date: D,
      slot: 'lunch',
      title: '鸡胸肉饭',
      kcal: 9999, // 有条目时整餐数值以条目为准，这里会被忽略
      inputMethod: 'search',
      source: 'app',
      items: [
        { id: uid(), foodId: 'f_rice', name: '米饭', amount: 1, unit: '碗', kcal: 1 }, // kcal 由服务端按食物库重算
        { id: uid(), foodId: 'f_chicken_breast', name: '鸡胸肉', amount: 120, unit: 'g' },
        { id: uid(), name: '酱汁', amount: 1, unit: '份', kcal: 40, proteinG: 0, carbsG: 8, fatG: 1 },
      ],
    })
    expect(res.statusCode).toBe(200)
    const m = res.json()
    expect(m.items[0]).toMatchObject({ grams: 150, kcal: 174, proteinG: 3.9 }) // 116 × 1.5
    expect(m.items[1]).toMatchObject({ grams: 120, kcal: 198, proteinG: 37.2 }) // 165 × 1.2
    expect(m.kcal).toBe(174 + 198 + 40)
    expect(m.proteinG).toBe(41.1)
  })

  it('修改时整体替换条目；未知食物返回 400', async () => {
    const u = await user()
    const id = uid()
    const base = { date: D, slot: 'dinner', title: '晚饭', inputMethod: 'manual', source: 'app' }
    await u.call('PUT', `/meals/${id}`, { ...base, items: [{ id: uid(), foodId: 'f_rice', name: '米饭', amount: 1, unit: '碗' }, { id: uid(), foodId: 'f_egg', name: '鸡蛋', amount: 2, unit: '个' }] })
    const r = (await u.call('PUT', `/meals/${id}`, { ...base, items: [{ id: uid(), foodId: 'f_egg', name: '鸡蛋', amount: 1, unit: '个' }] })).json()
    expect(r.items).toHaveLength(1)
    expect(r.kcal).toBe(78)
    expect((await u.call('PUT', `/meals/${uid()}`, { ...base, items: [{ id: uid(), foodId: 'f_nope', name: '?', amount: 1, unit: 'g' }] })).json().error).toBe('unknown_food')
  })

  it('不展开条目：整餐数值就是填的数；没填热量为 null', async () => {
    const u = await user()
    const a = (await u.call('PUT', `/meals/${uid()}`, { date: D, slot: 'lunch', title: '黄焖鸡米饭', kcal: 800, proteinG: 35, inputMethod: 'chat', confidence: 'medium', source: 'chat' })).json()
    expect(a).toMatchObject({ kcal: 800, proteinG: 35, items: [], confidence: 'medium' })
    const b = (await u.call('PUT', `/meals/${uid()}`, { date: D, slot: 'snack', title: '一个橘子', inputMethod: 'manual', source: 'app' })).json()
    expect(b.kcal).toBeNull()
  })

  it('常吃：按标题归类计数，返回最近一次的完整记录', async () => {
    const u = await user()
    const lunch = (date: string) => ({ date, slot: 'lunch', title: '黄焖鸡 米饭', kcal: 800, inputMethod: 'manual', source: 'app' })
    await u.call('PUT', `/meals/${uid()}`, lunch('2026-10-01'))
    await u.call('PUT', `/meals/${uid()}`, lunch('2026-10-05'))
    await u.call('PUT', `/meals/${uid()}`, { ...lunch('2026-10-08'), title: '黄焖鸡米饭', kcal: 820 })
    await u.call('PUT', `/meals/${uid()}`, { ...lunch('2026-10-09'), title: '沙拉' })
    await u.call('PUT', `/meals/${uid()}`, { ...lunch('2026-07-01'), title: '沙拉' }) // 超过 60 天，不计
    const f = (await u.call('GET', `/meals/frequent?today=${D}`)).json()
    expect(f.map((x: { count: number; meal: { title: string } }) => [x.meal.title, x.count])).toEqual([
      ['黄焖鸡米饭', 3],
      ['沙拉', 1],
    ])
    expect(f[0].meal.kcal).toBe(820)
  })
})

describe('食物库', () => {
  it('按名称和别名搜索，完全匹配排前面', async () => {
    const u = await user()
    const names = (await u.call('GET', '/foods?q=鸡胸')).json().map((f: { name: string }) => f.name)
    expect(names[0]).toBe('鸡胸肉（熟）')
    expect(names).toContain('鸡胸肉沙拉（少酱）')
    expect((await u.call('GET', '/foods?q=西红柿')).json().map((f: { name: string }) => f.name)).toContain('番茄')
    expect((await u.call('GET', '/foods?q=%')).json()).toEqual([]) // 通配符被转义
  })

  it('自定义食物只有本人可见，不能改公共食物', async () => {
    const a = await user()
    const b = await user()
    const food = { name: '妈妈做的红烧排骨', category: '家常菜', kcal100g: 280, protein100g: 18, carbs100g: 6, fat100g: 20, units: [{ unit: '块', grams: 40 }], defaultUnit: '块' }
    expect((await a.call('PUT', `/foods/${uid()}`, food)).statusCode).toBe(200)
    expect((await a.call('GET', '/foods?q=排骨')).json()).toHaveLength(1)
    expect((await b.call('GET', '/foods?q=排骨')).json()).toHaveLength(0)
    expect((await a.call('PUT', '/foods/f_rice', { ...food, name: '米饭' })).statusCode).toBe(400)
  })
})

describe('训练', () => {
  it('同时只能有一条进行中的训练：第二条返回 409 并带上进行中的那条', async () => {
    const u = await user()
    const first = uid()
    expect((await u.call('PUT', `/sessions/${first}`, session())).statusCode).toBe(200)
    const second = await u.call('PUT', `/sessions/${uid()}`, session({ activityId: 'run' }))
    expect(second.statusCode).toBe(409)
    expect(second.json().active.id).toBe(first)
  })

  it('开始 → 结束都是对同一条的 PUT；bootstrap 带出进行中的训练', async () => {
    const u = await user()
    const id = uid()
    await u.call('PUT', `/sessions/${id}`, session())
    expect((await u.call('GET', `/bootstrap?today=${D}`)).json().activeSession.id).toBe(id)
    const done = await u.call('PUT', `/sessions/${id}`, session({ status: 'completed', endAt: t0 + 40 * 60000, rpe: 'ok', kcal: 261 }))
    expect(done.json()).toMatchObject({ status: 'completed', rpe: 'ok', kcal: 261 })
    const boot = (await u.call('GET', `/bootstrap?today=${D}`)).json()
    expect(boot.activeSession).toBeNull()
    expect(boot.sessions).toHaveLength(1)
    // 结束后可以开始新的
    expect((await u.call('PUT', `/sessions/${uid()}`, session())).statusCode).toBe(200)
  })

  it('校验：未知项目、结束早于开始、已完成没有结束时间', async () => {
    const u = await user()
    expect((await u.call('PUT', `/sessions/${uid()}`, session({ activityId: 'teleport' }))).statusCode).toBe(400)
    expect((await u.call('PUT', `/sessions/${uid()}`, session({ status: 'completed', endAt: t0 - 1 }))).statusCode).toBe(400)
    expect((await u.call('PUT', `/sessions/${uid()}`, session({ status: 'completed' }))).statusCode).toBe(400)
  })
})

describe('小镇与启动数据', () => {
  it('设施增改删；bootstrap 返回近 35 天的数据', async () => {
    const u = await user()
    const home = uid()
    await u.call('PUT', `/facilities/${home}`, { kind: 'home', posX: 3, posY: 3 })
    const pool = uid()
    await u.call('PUT', `/facilities/${pool}`, { kind: 'pool', name: '小区游泳馆', posX: 5, posY: 2 })
    await u.call('PUT', `/facilities/${pool}`, { kind: 'pool', name: '小区游泳馆', posX: 1, posY: 1 })
    await u.call('DELETE', `/facilities/${home}`)
    await u.call('PUT', `/water/${uid()}`, { date: '2026-09-07', ml: 250, source: 'app' }) // 第 35 天
    await u.call('PUT', `/water/${uid()}`, { date: '2026-09-06', ml: 250, source: 'app' }) // 第 36 天，不在范围内
    await u.call('PUT', `/sessions/${uid()}`, session({ status: 'completed', date: '2026-01-01', startAt: Date.parse('2026-01-01T10:00:00Z'), endAt: Date.parse('2026-01-01T10:30:00Z') }))
    const boot = (await u.call('GET', `/bootstrap?today=${D}`)).json()
    expect(boot.facilities).toEqual([expect.objectContaining({ id: pool, kind: 'pool', name: '小区游泳馆', pos: { x: 1, y: 1 } })])
    expect(boot.from).toBe('2026-09-07')
    expect(boot.water).toHaveLength(1)
    // 训练记录不按日期截断（等级由全部记录推算）
    expect(boot.sessions).toHaveLength(1)
    expect(boot.sessions[0].date).toBe('2026-01-01')
  })
})
