/**
 * 饮食模型（详见 docs/backend-design.md 4.3b）
 *
 * 一餐 = Meal，可以有 0..n 条 MealItem。
 * - 没有条目：整餐上的数值就是最终数值
 * - 有条目：整餐数值 = 条目之和（条目是唯一数据源）
 * 关联食物库的条目，营养数值由"每 100g 数值 × 克数"计算，并在保存时快照下来。
 */

export interface FoodUnit {
  unit: string
  grams: number
}

export interface Food {
  id: string
  ownerId: string | null
  name: string
  aliases: string[]
  category: string
  kcal100g: number
  protein100g: number
  carbs100g: number
  fat100g: number
  units: FoodUnit[]
  defaultUnit: string
  verified: boolean
}

export interface Nutrients {
  kcal: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
}

export type InputMethod = 'chat' | 'photo' | 'favorite' | 'search' | 'manual'
export type Confidence = 'high' | 'medium' | 'low'

export interface MealItem extends Nutrients {
  id: string
  foodId: string | null
  name: string
  amount: number
  unit: string
  grams: number | null
  confidence: Confidence | null
}

export interface MealRecord extends Nutrients {
  id: string
  date: string
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  eatenAt: number | null
  title: string
  inputMethod: InputMethod
  confidence: Confidence | null
  source: string
  items: MealItem[]
  updatedAt: number
}

/**
 * 保留 1 位小数，四舍五入。先用 toPrecision(12) 去掉浮点尾差：
 * 0.3 × 1.5 = 0.44999…96、25.9 × 1.5 = 38.84999…94，应分别进位为 0.5、38.9
 */
const r1 = (n: number) => Math.round(Number((n * 10).toPrecision(12))) / 10

/** 克和毫升直接按数量；其他单位查食物的单位表 */
export function gramsOf(food: Pick<Food, 'units'>, amount: number, unit: string): number | null {
  if (unit === 'g' || unit === 'ml') return amount
  const u = food.units.find((x) => x.unit === unit)
  return u ? r1(amount * u.grams) : null
}

export function nutrientsFor(food: Pick<Food, 'kcal100g' | 'protein100g' | 'carbs100g' | 'fat100g'>, grams: number): Nutrients {
  const k = grams / 100
  return { kcal: Math.round(food.kcal100g * k), proteinG: r1(food.protein100g * k), carbsG: r1(food.carbs100g * k), fatG: r1(food.fat100g * k) }
}

/** 条目求和：每项只累加已知的值；全部未知则为 null（首页会提示估算） */
export function sumNutrients(items: Nutrients[]): Nutrients {
  const sum = (key: keyof Nutrients, round: (n: number) => number) => {
    const known = items.map((i) => i[key]).filter((v): v is number => v != null)
    return known.length ? round(known.reduce((a, b) => a + b, 0)) : null
  }
  return { kcal: sum('kcal', Math.round), proteinG: sum('proteinG', r1), carbsG: sum('carbsG', r1), fatG: sum('fatG', r1) }
}

/** 常吃：按标题归类计数（标题去空格、统一大小写） */
export const mealKey = (title: string) => title.replace(/\s+/g, '').toLowerCase()
