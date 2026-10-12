import { initialState, migrateLegacy, type AppState } from '@tmc/core/state'

export * from '@tmc/core/state'

const KEY = 'tmc:v3'

/** 读取登录前保存在本机的旧数据（第 6 步：首次登录后导入到账号） */
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
