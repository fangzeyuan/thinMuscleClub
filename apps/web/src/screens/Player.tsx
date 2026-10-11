import { useEffect, useMemo, useRef, useState } from 'react'
import { TAG_LABEL, WARMUP } from '@tmc/core/data/exercises'
import type { Workout, WorkItem } from '@tmc/core/plan'
import type { SessionDetails } from '@tmc/core/training'
import ExGlyph from './ExGlyph'

type Step =
  | { kind: 'warmup'; name: string; sec: number; cues: string[]; idx: number }
  | { kind: 'work'; item: WorkItem; round: number; idx: number; sec: number | null }
  | { kind: 'rest'; sec: number; next: string; roundEnd: boolean }

function flatten(w: Workout): Step[] {
  const steps: Step[] = WARMUP.map((x, idx) => ({ kind: 'warmup', ...x, idx }))
  for (let r = 1; r <= w.rounds; r++) {
    w.items.forEach((item, idx) => {
      const sec = item.ex.mode === 'time' ? item.amount * (item.ex.perSide ? 2 : 1) : null
      steps.push({ kind: 'work', item, round: r, idx, sec })
      const last = r === w.rounds && idx === w.items.length - 1
      if (!last) {
        const roundEnd = idx === w.items.length - 1
        const nextItem = roundEnd ? w.items[0] : w.items[idx + 1]
        steps.push({ kind: 'rest', sec: roundEnd ? w.roundRestSec : w.restSec, next: nextItem.ex.name, roundEnd })
      }
    })
  }
  return steps
}

let audioCtx: AudioContext | null = null
function beep(freq = 880, ms = 120) {
  try {
    audioCtx ??= new AudioContext()
    const o = audioCtx.createOscillator()
    const g = audioCtx.createGain()
    o.frequency.value = freq
    g.gain.value = 0.08
    o.connect(g).connect(audioCtx.destination)
    o.start()
    o.stop(audioCtx.currentTime + ms / 1000)
  } catch {
    // 静音环境忽略
  }
}

/** 把已完成的组汇总成训练明细 */
function summarize(done: Step[]): SessionDetails {
  const map = new Map<string, NonNullable<SessionDetails['exercises']>[number]>()
  for (const s of done) {
    if (s.kind !== 'work') continue
    const ex = s.item.ex
    if (!map.has(ex.id)) map.set(ex.id, { exerciseId: ex.id, name: ex.name, sets: [] })
    map.get(ex.id)!.sets.push(ex.mode === 'time' ? { sec: s.item.amount } : { reps: s.item.amount })
  }
  return { exercises: [...map.values()] }
}

export default function Player({ workout, onExit, onFinish }: { workout: Workout; onExit: () => void; onFinish: (sec: number, details: SessionDetails) => void }) {
  const steps = useMemo(() => flatten(workout), [workout])
  const [i, setI] = useState(-1) // -1 = 准备倒计时
  const [left, setLeft] = useState(3)
  const [paused, setPaused] = useState(false)
  const [quit, setQuit] = useState(false)
  const elapsed = useRef(0)
  const step = i >= 0 ? steps[i] : null
  const total = i < 0 ? 3 : step && 'sec' in step && step.sec ? step.sec : 0

  const go = (n: number) => {
    if (n >= steps.length) {
      onFinish(elapsed.current, summarize(steps))
      return
    }
    const s = steps[Math.max(0, n)]
    setI(Math.max(0, n))
    setLeft(s.sec ?? 0)
  }

  useEffect(() => {
    if (paused || quit) return
    const t = setInterval(() => {
      elapsed.current += 1
      if (total > 0) {
        setLeft((l) => {
          if (l <= 4 && l > 1) beep(660, 90)
          return l - 1
        })
      }
    }, 1000)
    return () => clearInterval(t)
  }, [paused, quit, total, i])

  useEffect(() => {
    if (total > 0 && left <= 0) {
      beep(990, 220)
      go(i + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left])

  const workSteps = steps.filter((s) => s.kind === 'work').length
  const doneWork = steps.slice(0, Math.max(0, i)).filter((s) => s.kind === 'work').length
  const pct = i < 0 ? 0 : (doneWork / workSteps) * 100

  const halfway = step?.kind === 'work' && step.item.ex.perSide && step.sec && left <= step.sec / 2

  let body: JSX.Element
  if (i < 0) {
    body = (
      <div className="pl-center">
        <p className="pl-label">准备开始</p>
        <div className="pl-big">{left}</div>
        <p className="muted">
          先热身 2 分钟，然后 {workout.items.length} 个动作 × {workout.rounds} 轮
        </p>
      </div>
    )
  } else if (step!.kind === 'warmup') {
    body = (
      <div className="pl-center">
        <p className="pl-label">
          热身 {step!.idx + 1}/{WARMUP.length}
        </p>
        <h2 className="pl-name">{step!.name}</h2>
        <Ring left={left} total={step!.sec} />
        <ul className="pl-cues">
          {step!.cues.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    )
  } else if (step!.kind === 'rest') {
    const s = step!
    body = (
      <div className="pl-center rest">
        <p className="pl-label">{s.roundEnd ? '本轮完成，喘口气' : '休息'}</p>
        <Ring left={left} total={s.sec} rest />
        <p className="pl-next">
          下一个 <b>{s.next}</b>
        </p>
        <button className="btn ghost" onClick={() => setLeft((l) => l + 10)}>
          +10 秒
        </button>
      </div>
    )
  } else {
    const s = step as Extract<Step, { kind: 'work' }>
    const ex = s.item.ex
    body = (
      <div className="pl-center">
        <p className="pl-label">
          第 {s.round}/{workout.rounds} 轮 · 动作 {s.idx + 1}/{workout.items.length}
        </p>
        <div className="pl-demo">
          <ExGlyph tag={ex.tags[0]} size={88} />
          <span>动作演示视频</span>
        </div>
        <h2 className="pl-name">{ex.name}</h2>
        <p className="muted">{ex.tags.slice(0, 2).map((t) => TAG_LABEL[t]).join(' · ')}</p>
        {s.sec ? (
          <>
            <Ring left={left} total={s.sec} />
            {ex.perSide && <p className="pl-side">{halfway ? '换另一侧' : '先做一侧'}</p>}
          </>
        ) : (
          <div className="pl-reps">
            <b>{s.item.amount}</b>
            <span>次{ex.perSide ? ' / 每侧' : ''}</span>
          </div>
        )}
        <ul className="pl-cues">
          {ex.cues.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className={`screen player ${step?.kind === 'rest' ? 'is-rest' : ''}`}>
      <header className="topbar">
        <button className="icon-btn" onClick={() => setQuit(true)} aria-label="退出">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="progress">
          <div style={{ width: `${pct}%` }} />
        </div>
        <span className="step-count">{workout.title}</span>
      </header>

      <div className="pl-body">{body}</div>

      <div className="pl-controls">
        <button className="icon-btn" disabled={i <= 0} onClick={() => go(i - 1)} aria-label="上一个">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 20L9 12l10-8zM5 19V5" />
          </svg>
        </button>
        {step?.kind === 'work' && !step.sec ? (
          <button className="btn primary pl-main" onClick={() => go(i + 1)}>
            完成
          </button>
        ) : step?.kind === 'rest' ? (
          <button className="btn primary pl-main" onClick={() => go(i + 1)}>
            跳过休息
          </button>
        ) : (
          <button className="btn primary pl-main" onClick={() => setPaused(!paused)}>
            {paused ? '继续' : '暂停'}
          </button>
        )}
        <button className="icon-btn" onClick={() => go(i + 1)} aria-label="下一个">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 4l10 8-10 8zM19 5v14" />
          </svg>
        </button>
      </div>

      {quit && (
        <div className="sheet-mask">
          <div className="sheet">
            <h3>确定要结束训练吗？</h3>
            <p className="muted">已完成 {doneWork}/{workSteps} 组，坚持一下就练完了。</p>
            <button className="btn primary block" onClick={() => setQuit(false)}>
              继续训练
            </button>
            {doneWork > 0 && (
              <button className="btn ghost block" onClick={() => onFinish(elapsed.current, summarize(steps.slice(0, Math.max(0, i))))}>
                结束并记录
              </button>
            )}
            <button className="link center" onClick={onExit}>
              放弃本次训练
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Ring({ left, total, rest }: { left: number; total: number; rest?: boolean }) {
  const r = 64
  const c = 2 * Math.PI * r
  return (
    <div className={`ring ${rest ? 'rest' : ''}`}>
      <svg viewBox="0 0 160 160" width="160" height="160">
        <circle cx="80" cy="80" r={r} className="ring-bg" />
        <circle
          cx="80"
          cy="80"
          r={r}
          className="ring-fg"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, left) / Math.max(1, total))}
          transform="rotate(-90 80 80)"
        />
      </svg>
      <div className="ring-text">
        <b>{Math.max(0, left)}</b>
        <span>秒</span>
      </div>
    </div>
  )
}

