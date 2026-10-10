import { useMemo, useState } from 'react'
import { streak, useAppState, type Feedback } from './lib/store'
import { assess, buildWorkout, dateKey, daysBetween, phaseOf, weekSchedule, weekdayIndex, type PlanCtx, type Profile, type Workout } from './lib/plan'
import Welcome from './screens/Welcome'
import Assessment from './screens/Assessment'
import Generating from './screens/Generating'
import Result from './screens/Result'
import Today from './screens/Today'
import PlanTab from './screens/PlanTab'
import Me from './screens/Me'
import Player from './screens/Player'
import Done from './screens/Done'

type Route = 'welcome' | 'assess' | 'generating' | 'result' | 'main' | 'workout' | 'done'
type Tab = 'today' | 'plan' | 'me'

export default function App() {
  const [state, setState, reset] = useAppState()
  const [route, setRoute] = useState<Route>(state.profile && state.startDate ? 'main' : 'welcome')
  const [tab, setTab] = useState<Tab>('today')
  const [draft, setDraft] = useState<Profile | null>(null)
  const [active, setActive] = useState<Workout | null>(null)
  const [lastRun, setLastRun] = useState<{ durationSec: number; kcal: number } | null>(null)

  const today = dateKey(new Date())
  const ctx = useMemo((): PlanCtx | null => {
    if (!state.profile || !state.startDate) return null
    const p = state.profile
    const a = assess(p)
    const dayIdx = Math.max(0, daysBetween(state.startDate, today))
    const week = Math.min(a.weeks, Math.floor(dayIdx / 7) + 1)
    const phase = phaseOf(week, a.weeks)
    const schedule = weekSchedule(p)
    const kind = schedule[weekdayIndex(new Date())]
    const workout = buildWorkout(p, kind, dayIdx + 1, phase, state.intensity)
    return { p, a, dayIdx, week, phase, schedule, kind, workout }
  }, [state.profile, state.startDate, state.intensity, today])

  const startPlan = () => {
    if (!draft) return
    setState((s) => ({ ...s, profile: draft, startDate: today, intensity: 1 }))
    setTab('today')
    setRoute('main')
  }

  const finishWorkout = (durationSec: number) => {
    if (!active) return
    const kcal = Math.round((active.kcal * durationSec) / Math.max(1, active.estMin * 60))
    setLastRun({ durationSec, kcal })
    setState((s) => ({ ...s, logs: [...s.logs, { date: today, title: active.title, durationSec, kcal }] }))
    setRoute('done')
  }

  const submitFeedback = (fb: Feedback) => {
    setState((s) => {
      const logs = [...s.logs]
      if (logs.length) logs[logs.length - 1] = { ...logs[logs.length - 1], feedback: fb }
      const delta = fb === 'easy' ? 0.1 : fb === 'hard' ? -0.1 : 0
      return { ...s, logs, intensity: Math.min(1.4, Math.max(0.7, Math.round((s.intensity + delta) * 100) / 100)) }
    })
    setActive(null)
    setRoute('main')
  }

  let screen: JSX.Element
  switch (route) {
    case 'welcome':
      screen = <Welcome onStart={() => setRoute('assess')} />
      break
    case 'assess':
      screen = (
        <Assessment
          initial={state.profile ?? undefined}
          onBack={() => setRoute(state.profile ? 'main' : 'welcome')}
          onDone={(p) => {
            setDraft(p)
            setRoute('generating')
          }}
        />
      )
      break
    case 'generating':
      screen = <Generating onDone={() => setRoute('result')} />
      break
    case 'result':
      screen = <Result profile={draft!} onStart={startPlan} onRedo={() => setRoute('assess')} />
      break
    case 'workout':
      screen = <Player workout={active!} onExit={() => setRoute('main')} onFinish={finishWorkout} />
      break
    case 'done':
      screen = (
        <Done
          workout={active!}
          run={lastRun!}
          streak={streak(state.logs.map((l) => l.date), today)}
          totalDays={new Set(state.logs.map((l) => l.date)).size}
          onFeedback={submitFeedback}
        />
      )
      break
    default: {
      if (!ctx) {
        screen = <Welcome onStart={() => setRoute('assess')} />
        break
      }
      const begin = (w: Workout) => {
        setActive(w)
        setRoute('workout')
      }
      screen = (
        <div className="tabs-layout">
          <div className="tab-body">
            {tab === 'today' && (
              <Today
                ctx={ctx}
                state={state}
                today={today}
                onStart={begin}
                onToggleMeal={(i) =>
                  setState((s) => {
                    const m = [...(s.meals[today] ?? [false, false, false])]
                    m[i] = !m[i]
                    return { ...s, meals: { ...s.meals, [today]: m } }
                  })
                }
              />
            )}
            {tab === 'plan' && <PlanTab ctx={ctx} logs={state.logs} />}
            {tab === 'me' && (
              <Me
                profile={ctx.p}
                logs={state.logs}
                intensity={state.intensity}
                onRedo={() => setRoute('assess')}
                onReset={() => {
                  reset()
                  setRoute('welcome')
                }}
              />
            )}
          </div>
          <nav className="tabbar">
            {(
              [
                ['today', '今日', 'M3 12l9-8 9 8M5 10v10h14V10'],
                ['plan', '计划', 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4'],
                ['me', '我的', 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c1-4 4.5-6 8-6s7 2 8 6'],
              ] as const
            ).map(([k, label, d]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={d} />
                </svg>
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      )
    }
  }

  return (
    <div className="stage">
      <div className="phone">{screen}</div>
    </div>
  )
}
