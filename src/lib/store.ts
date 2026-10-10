import { useEffect, useState } from 'react'
import { dateKey, type Profile } from './plan'

export type Feedback = 'easy' | 'ok' | 'hard'

export interface WorkoutLog {
  date: string
  title: string
  durationSec: number
  kcal: number
  feedback?: Feedback
}

export interface AppState {
  profile: Profile | null
  startDate: string | null
  intensity: number
  logs: WorkoutLog[]
  /** date -> 三餐蛋白质打卡 */
  meals: Record<string, boolean[]>
}

const KEY = 'tmc:v1'

const initial: AppState = { profile: null, startDate: null, intensity: 1, logs: [], meals: {} }

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...initial, ...JSON.parse(raw) } : initial
  } catch {
    return initial
  }
}

export function useAppState() {
  const [state, setState] = useState<AppState>(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // 存储不可用时仅保留在内存中
    }
  }, [state])
  const reset = () => setState(initial)
  return [state, setState, reset] as const
}

export function streak(dates: string[], today: string) {
  const set = new Set(dates)
  let n = 0
  const d = new Date(today + 'T00:00:00')
  if (!set.has(today)) d.setDate(d.getDate() - 1)
  while (set.has(dateKey(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}
