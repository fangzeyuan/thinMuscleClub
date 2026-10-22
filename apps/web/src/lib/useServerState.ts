/**
 * 服务端状态（在线为主）
 *
 * - 启动：用 Cookie 刷新登录 → GET /bootstrap → 转成本地 AppState
 * - 修改：界面照常用 ops 改本地状态；每次变化后 diffState(上次已同步, 当前) 算出接口调用，按顺序发送
 * - 断网：只有训练可以排队（localStorage），联网 / 回到前台时按顺序补传；其他修改提示"未保存"并在联网后以服务端为准
 * - 多端：回到前台、以及前台每 60 秒，在没有未完成请求时重新拉取
 * - 聊天记录暂存本机（P2 移到服务端）
 */
import { dateKey } from '@tmc/core/plan'
import { initialState, uid, type AppState, type ChatMsg } from '@tmc/core/state'
import { diffState, fromBootstrap, type BootstrapPayload, type SyncCall } from '@tmc/core/sync'
import { trainingOps, type TrainingSession } from '@tmc/core/training'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api, authApi, refreshSession, setOnUnauthenticated } from './api'

export type Phase = 'checking' | 'login' | 'loading' | 'ready'

const LAST_USER = 'tmc:lastUser'
const k = (kind: 'cache' | 'queue' | 'chat', userId: string) => `tmc:${kind}:${userId}`

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 存储不可用时忽略（隐私模式等）
  }
}

type Queue = Record<string, SyncCall>

/** 上次关掉 App 时还在生成中的回复：标为中断、可重试 */
const restoreChat = (chat: ChatMsg[]) =>
  chat.map((m) => (m.pending ? { ...m, pending: false, phase: undefined, error: true, retryable: true, content: `${m.content ? `${m.content}\n\n` : ''}回复被中断了，请重试` } : m))

/** 把离线队列里还没上传的训练和测评档案叠加到服务端数据上 */
function overlayQueue(s: AppState, queue: Queue): AppState {
  let sessions = s.sessions
  let profile = { profile: s.profile, startDate: s.startDate, intensity: s.intensity }
  for (const call of Object.values(queue)) {
    if (call.key === 'profile') {
      profile = call.body as typeof profile
      continue
    }
    const id = call.path.split('/').pop()!
    if (call.method === 'DELETE') sessions = sessions.filter((x) => x.id !== id)
    else {
      const rec = { id, createdAt: Date.now(), updatedAt: Date.now(), ...(call.body as object) } as TrainingSession
      sessions = sessions.some((x) => x.id === id) ? sessions.map((x) => (x.id === id ? { ...x, ...rec } : x)) : [...sessions, rec]
    }
  }
  return { ...s, ...profile, sessions }
}

export function useServerState() {
  const [phase, setPhase] = useState<Phase>('checking')
  const [state, setState] = useState<AppState>(initialState)
  const [offline, setOffline] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  const userId = useRef<string | null>(null)
  const synced = useRef<AppState | null>(null) // 最近一次与服务端一致的状态
  const resyncSoon = useRef(false) // 有修改没保存成功 / 被服务端拒绝：之后重新拉取，以服务端为准
  const stateRef = useRef(state)
  stateRef.current = state
  const chain = useRef<Promise<void>>(Promise.resolve()) // 所有请求串行发送，保证顺序
  const inflight = useRef(0)

  const queue = () => (userId.current ? read<Queue>(k('queue', userId.current), {}) : {})
  const saveQueue = (q: Queue) => {
    if (!userId.current) return
    write(k('queue', userId.current), q)
    setPendingCount(Object.keys(q).length)
  }

  /* ---------- 拉取（同一时间只跑一个，并发调用复用同一次请求） ---------- */
  const loading = useRef<Promise<void> | null>(null)
  const load = useCallback((silent = false) => {
    loading.current ??= doLoad(silent).finally(() => {
      loading.current = null
    })
    return loading.current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doLoad = async (silent: boolean) => {
    if (!silent) setPhase('loading')
    try {
      const b = await api<BootstrapPayload>(`/bootstrap?today=${dateKey(new Date())}`)
      userId.current = b.user.id
      write(LAST_USER, b.user.id)
      const s = overlayQueue(fromBootstrap(b, silent ? [] : restoreChat(read(k('chat', b.user.id), []))), queue())
      // 后台刷新只更新数据，聊天保留内存里的（否则正在到达的回复会被覆盖掉）
      synced.current = silent ? { ...s, chat: stateRef.current.chat } : s
      setState((cur) => (silent ? { ...s, chat: cur.chat } : s))
      setOffline(false)
      setNotice((n) => (n?.startsWith('网络不可用') ? null : n)) // 恢复联网后清掉断网提示
      setPendingCount(Object.keys(queue()).length)
      // 新账号：自动放一座"我的小屋"（会通过同步写到服务端）；按当前状态判断，避免重复添加
      if (!s.game.facilities.some((f) => f.kind === 'home')) {
        setState((cur) => (cur.game.facilities.some((f) => f.kind === 'home') ? cur : trainingOps.addFacility({ id: uid(), kind: 'home', pos: { x: 3, y: 3 }, createdAt: Date.now() })(cur)))
      }
      setPhase('ready')
    } catch (e) {
      const err = e as ApiError
      if (err.status === 0 && silent) {
        // 运行中断网：保留当前界面，联网后再以服务端为准
        setOffline(true)
        resyncSoon.current = true
        return
      }
      if (err.status === 0) {
        // 断网启动：用本机缓存，只有训练计时可用
        const last = userId.current ?? read<string | null>(LAST_USER, null)
        const cached = last ? read<AppState | null>(k('cache', last), null) : null
        if (cached) {
          userId.current = last
          const s = overlayQueue(cached, queue())
          synced.current = s
          setState(s)
          setOffline(true)
          setPhase('ready')
          return
        }
        setNotice('网络不可用，请联网后再打开')
      }
      if (!silent) setPhase(err.status === 401 ? 'login' : 'ready')
    }
  }


  const sendCall = useCallback(async (call: SyncCall) => {
    try {
      await api(call.path, { method: call.method, body: call.body })
      setOffline(false)
    } catch (e) {
      const err = e as ApiError
      if (err.status === 0) {
        setOffline(true)
        if (call.queueable) {
          saveQueue({ ...queue(), [call.key]: call })
          return
        }
        setNotice('网络不可用，刚才的修改没有保存')
      } else if (err.code === 'active_exists') {
        setNotice('另一台设备正在训练中，已同步为最新状态')
      } else if (err.status !== 404 && err.status !== 410) {
        setNotice(`保存失败：${err.message}`)
      }
      resyncSoon.current = true // 以服务端为准
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const enqueue = useCallback(
    (fn: () => Promise<void>) => {
      inflight.current++
      chain.current = chain.current.then(fn).finally(() => {
        inflight.current--
        if (inflight.current === 0 && resyncSoon.current) {
          resyncSoon.current = false
          load(true)
        }
      })
    },
    [load],
  )

  /** 补传离线队列（按加入顺序；遇到断网就停）；补传完重新拉取一次，以服务端为准 */
  const flush = useCallback(() => {
    resyncSoon.current = true
    enqueue(async () => {
      const q = queue()
      for (const [key, call] of Object.entries(q)) {
        try {
          await api(call.path, { method: call.method, body: call.body })
          const rest = queue()
          delete rest[key]
          saveQueue(rest)
          setOffline(false)
        } catch (e) {
          const err = e as ApiError
          if (err.status === 0) {
            setOffline(true)
            return
          }
          // 服务端拒绝（如另一台设备已在训练）：丢弃这条，以服务端为准
          const rest = queue()
          delete rest[key]
          saveQueue(rest)
          if (err.code === 'active_exists') setNotice('另一台设备正在训练中，已同步为最新状态')
          resyncSoon.current = true
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enqueue])

  /* ---------- 状态变化 → 同步 ---------- */
  useEffect(() => {
    if (phase !== 'ready' || !userId.current || !synced.current) return
    const prev = synced.current
    synced.current = state
    write(k('cache', userId.current), state)
    if (prev.chat !== state.chat) write(k('chat', userId.current), state.chat.slice(-200))
    for (const call of diffState(prev, state)) {
      // 断网时，训练直接进队列；其他修改尝试发送（会提示未保存）
      if (offline && call.queueable) saveQueue({ ...queue(), [call.key]: call })
      else enqueue(() => sendCall(call))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, phase])

  /* ---------- 启动、联网、回到前台 ---------- */
  useEffect(() => {
    setOnUnauthenticated(() => setPhase('login'))
    refreshSession().then((r) => {
      if (r === 'unauthenticated') setPhase('login')
      else load() // 'ok' 或 'offline'（离线时 load 会回退到本机缓存）
    })
  }, [load])

  useEffect(() => {
    if (phase !== 'ready') return
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      if (Object.keys(queue()).length) flush() // 补传后会自动重新拉取
      else if (inflight.current === 0) load(true)
    }
    const timer = setInterval(refresh, 60_000)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    if (Object.keys(queue()).length) flush()
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, flush, load])

  /* ---------- 登录 / 退出 ---------- */
  const afterLogin = useCallback(() => load(), [load])

  const logout = useCallback(async () => {
    await authApi.logout()
    try {
      localStorage.removeItem(LAST_USER)
    } catch {
      // 忽略
    }
    userId.current = null
    synced.current = null
    setState(initialState())
    setPhase('login')
  }, [])

  return {
    phase,
    state,
    setState,
    getState: () => stateRef.current,
    offline,
    pendingCount,
    notice,
    clearNotice: () => setNotice(null),
    afterLogin,
    logout,
  }
}
