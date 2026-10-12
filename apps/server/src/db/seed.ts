import { sql } from 'drizzle-orm'
import type { Db } from './client'
import { foods } from './schema'
import { SEED_FOODS } from './seed-foods'

/** 启动时同步公共食物库：新增的插入；未人工核对过的按种子数据更新；核对过的（verified）不覆盖 */
export async function seedFoods(db: Db) {
  await db
    .insert(foods)
    .values(SEED_FOODS)
    .onConflictDoUpdate({
      target: foods.id,
      set: {
        name: sql`excluded.name`,
        aliases: sql`excluded.aliases`,
        category: sql`excluded.category`,
        kcal100g: sql`excluded.kcal_100g`,
        protein100g: sql`excluded.protein_100g`,
        carbs100g: sql`excluded.carbs_100g`,
        fat100g: sql`excluded.fat_100g`,
        units: sql`excluded.units`,
        defaultUnit: sql`excluded.default_unit`,
        updatedAt: new Date(),
      },
      setWhere: sql`${foods.verified} = false and ${foods.ownerId} is null`,
    })
}
