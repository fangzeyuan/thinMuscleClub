import { useEffect, useRef, useState } from 'react'
import { initialState, migrateLegacy, type AppState } from '@tmc/core/state'

export * from '@tmc/core/state'

const KEY = 'tmc:v3'

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...initialState(), ...JSON.parse(raw) }
    return migrateLegacy(localStorage.getItem('tmc:v2'), localStorage.getItem('tmc:v1')) ?? initialState()
  } catch {
    // 数据损坏时从头开始
    return initialState()
  }
}

export function useAppState() {
  const [state, setState] = useState<AppState>(loadState)
  const ref = useRef(state)
  ref.current = state
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // 存储不可用时仅保留在内存中
    }
  }, [state])
  const reset = () => setState(initialState())
  return { state, setState, reset, getState: () => ref.current }
}
