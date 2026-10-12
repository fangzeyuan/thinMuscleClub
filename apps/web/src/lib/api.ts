/**
 * 服务端接口客户端
 * - access token 只放内存；refresh token 在 httpOnly Cookie 里（页面脚本读不到）
 * - 401 时自动刷新一次再重试；刷新也失败则通知上层回到登录页
 * - 网络错误统一抛 ApiError(status = 0, code = 'offline')
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export type RefreshResult = 'ok' | 'unauthenticated' | 'offline'

let accessToken: string | null = null
let refreshing: Promise<RefreshResult> | null = null
let onUnauthenticated: () => void = () => {}

export const setOnUnauthenticated = (cb: () => void) => {
  onUnauthenticated = cb
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, { ...init, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'offline', '网络不可用')
  }
}

async function readError(res: Response) {
  const data = await res.json().catch(() => ({}))
  return new ApiError(res.status, data.error ?? 'error', data.message ?? data.error ?? `请求失败（${res.status}）`, data)
}

/** 用 Cookie 里的 refresh token 换新的 access token；并发调用只发一次请求 */
export function refreshSession(): Promise<RefreshResult> {
  refreshing ??= (async (): Promise<RefreshResult> => {
    try {
      const res = await send('/api/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (!res.ok) {
        accessToken = null
        return 'unauthenticated'
      }
      accessToken = (await res.json()).accessToken
      return 'ok'
    } catch {
      return 'offline'
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const doFetch = () =>
    send(`/api/v1${path}`, {
      method: opts.method ?? 'GET',
      headers: { ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  let res = await doFetch()
  if (res.status === 401) {
    const r = await refreshSession()
    if (r === 'offline') throw new ApiError(0, 'offline', '网络不可用')
    if (r === 'unauthenticated') {
      onUnauthenticated()
      throw await readError(res)
    }
    res = await doFetch()
  }
  if (!res.ok) throw await readError(res)
  return (res.status === 204 ? undefined : await res.json()) as T
}

export type CodeKind = 'phone' | 'email'

export interface AuthConfig {
  methods: Record<CodeKind, boolean>
  inviteOnly: boolean
}

export const authApi = {
  async config(): Promise<AuthConfig> {
    const res = await send('/api/v1/auth/config', {})
    if (!res.ok) throw await readError(res)
    return res.json()
  },

  async sendCode(kind: CodeKind, target: string) {
    const res = await send('/api/v1/auth/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, target }) })
    if (!res.ok) throw await readError(res)
    return (await res.json()) as { cooldown: number; devCode?: string }
  },

  async verify(kind: CodeKind, target: string, code: string, consents: string[]) {
    const res = await send('/api/v1/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, target, code, consents, client: 'web' }),
    })
    if (!res.ok) throw await readError(res)
    const data = (await res.json()) as { accessToken: string; user: { id: string; isNew: boolean } }
    accessToken = data.accessToken
    return data.user
  },

  async logout() {
    await send('/api/v1/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {})
    accessToken = null
  },
}
