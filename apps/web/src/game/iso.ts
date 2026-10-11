/** 等距（2:1）投影。游戏逻辑只用网格坐标，渲染层负责投影，方便以后换引擎/迁小程序。 */
import type { FacilityKind } from '@tmc/core/data/activities'

export const GRID = 7
export const TW = 64 // 瓦片宽
export const TH = 32 // 瓦片高
const OX = (GRID * TW) / 2
const OY = 84

export const VIEW_W = GRID * TW
export const VIEW_H = GRID * TH + OY + 20

export interface Pt {
  x: number
  y: number
}

/** 网格坐标（可以是小数）→ 屏幕坐标 */
export const project = (gx: number, gy: number): Pt => ({ x: (gx - gy) * (TW / 2) + OX, y: (gx + gy) * (TH / 2) + OY })

export const poly = (pts: Pt[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

export const tileCorners = (x: number, y: number, inset = 0) => [
  project(x + inset, y + inset),
  project(x + 1 - inset, y + inset),
  project(x + 1 - inset, y + 1 - inset),
  project(x + inset, y + 1 - inset),
]

/** 设施门口：建筑左前方的位置，角色站在这里训练 */
export const doorOf = (pos: { x: number; y: number }): Pt => ({ x: pos.x + 0.5, y: pos.y + 1.2 })

/** 绘制顺序：越靠前（x+y 越大）越后画 */
export const depth = (gx: number, gy: number) => gx + gy

export const KIND_STYLE: Record<FacilityKind, { emoji: string; roof: string; wall: string; flat?: boolean }> = {
  home: { emoji: '🏠', roof: '#ff9f7a', wall: '#fff3ea' },
  gym: { emoji: '🏋️', roof: '#5b6cf0', wall: '#eef0ff' },
  pool: { emoji: '🏊', roof: '#4cb8f0', wall: '#e8f7ff', flat: true },
  track: { emoji: '🏃', roof: '#e8826b', wall: '#fff', flat: true },
  yoga_studio: { emoji: '🧘', roof: '#b48cf0', wall: '#f6f0ff' },
  court: { emoji: '🏸', roof: '#f0b84c', wall: '#fff8e8' },
  park: { emoji: '🌳', roof: '#5cc98a', wall: '#fff', flat: true },
}

/** 颜色变暗，用于建筑侧面 */
export function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * k)))
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`
}
