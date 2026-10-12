import { describe, expect, it } from 'vitest'
import { gramsOf, mealKey, nutrientsFor, sumNutrients } from '../src/food'

const rice = { kcal100g: 116, protein100g: 2.6, carbs100g: 25.9, fat100g: 0.3, units: [{ unit: '碗', grams: 150 }] }

describe('饮食计算', () => {
  it('单位换算：g / ml 直接用数量；其他单位查表；查不到返回 null', () => {
    expect(gramsOf(rice, 120, 'g')).toBe(120)
    expect(gramsOf(rice, 1.5, '碗')).toBe(225)
    expect(gramsOf(rice, 1, '盘')).toBeNull()
  })

  it('按克数计算营养素', () => {
    expect(nutrientsFor(rice, 150)).toEqual({ kcal: 174, proteinG: 3.9, carbsG: 38.9, fatG: 0.5 })
  })

  it('求和只累加已知值；全部未知为 null', () => {
    const known = { kcal: 100, proteinG: 10, carbsG: null, fatG: 1 }
    const unknown = { kcal: null, proteinG: null, carbsG: null, fatG: null }
    expect(sumNutrients([known, known, unknown])).toEqual({ kcal: 200, proteinG: 20, carbsG: null, fatG: 2 })
    expect(sumNutrients([])).toEqual(unknown)
  })

  it('常吃归类：忽略空格和大小写', () => {
    expect(mealKey('黄焖鸡 米饭')).toBe(mealKey('黄焖鸡米饭'))
    expect(mealKey('Poke Bowl')).toBe(mealKey('pokebowl'))
  })
})
