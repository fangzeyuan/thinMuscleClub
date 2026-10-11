import { useMemo, useRef, useState } from 'react'
import { ops, streak, uid, useAppState } from './lib/store'
import { completedSessions, trainingOps, type Rpe, type SessionDetails } from './lib/training'
import { assess, buildWorkout, dateKey, daysBetween, phaseOf, weekSchedule, weekdayIndex, type PlanCtx, type Profile, type Workout } from './lib/plan'
import { runChat } from './lib/ai'
import Welcome from './screens/Welcome'
import Assessment from './screens/Assessment'
import Generating from './screens/Generating'
import Result from './screens/Result'
import Today from './screens/Today'
import Coach from './screens/Coach'
import Progress from './screens/Progress'
import Me from './screens/Me'
import Player from './screens/Player'
import Done from './screens/Done'
import Town from './game/Town'

type Route = 'welcome' | 'assess' | 'generating' | 'result' | 'main' | 'workout' | 'done'
export type Tab = 'today' | 'town' | 'coach' | 'progress' | 'me'

const TABS: [Tab, string, string][] = [
  ['today', '今日', 'M3 12l9-8 9 8M5 10v10h14V10'],
  ['town', '小镇', 'M3 20h18M5 20V10l4-3 4 3v10M13 20v-6h6v6M16 14v-3'],
  ['coach', '教练', 'M4 5h16v11H9l-5 4zM8 10h.01M12 10h.01M16 10h.01'],
  ['progress', '进展', 'M4 19h16M6 15l4-5 3 3 5-7'],
  ['me', '我的', 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c1-4 4.5-6 8-6s7 2 8 6'],
]

export default function App() {
  const { state, setState, reset, getState } = useAppState()
  const [route, setRoute] = useState<Route>(state.profile && state.startDate ? 'main' : 'welcome')
  const [tab, setTab] = useState<Tab>('today')
  const [draft, setDraft] = useState<Profile | null>(null)
  const [active, setActive] = useState<Workout | null>(null)
  const [lastRun, setLastRun] = useState<{ id: string; durationSec: number; kcal: number } | null>(null)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false) // 同步锁，防止连点重复发送

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

  const sendChat = async (text: string) => {
    if (sendingRef.current || !text.trim()) return
    sendingRef.current = true
    setSending(true)
    try {
      await runChat(
        {
          getState,
          apply: (op) => setState(op),
          push: (m) => setState((s) => ({ ...s, chat: [...s.chat, m].slice(-200) })),
          today,
        },
        text.trim(),
      )
    } catch (e) {
      setState((s) => ({
        ...s,
        chat: [...s.chat, { id: uid(), role: 'assistant', content: String((e as Error).message || e), error: true, ts: Date.now() }],
      }))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const askCoach = (text: string) => {
    setTab('coach')
    setRoute('main')
    sendChat(text)
  }

  const startPlan = () => {
    if (!draft) return
    setState((s) => ({
      ...ops.setWeight(today, draft.weight)(s),
      profile: draft,
      startDate: s.startDate ?? today,
      intensity: s.profile ? s.intensity : 1,
    }))
    setTab('today')
    setRoute('main')
  }

  const finishWorkout = (durationSec: number, details: SessionDetails) => {
    if (!active || !state.profile) return
    const id = uid()
    const kcal = Math.round((active.kcal * durationSec) / Math.max(1, active.estMin * 60))
    setLastRun({ id, durationSec, kcal })
    setState(
      trainingOps.add({
        id,
        activityId: 'guided',
        title: active.title,
        facilityId: 'home',
        source: 'guided',
        date: today,
        minutes: Math.max(1, Math.round(durationSec / 60)),
        kcal,
        details,
        weightKg: state.profile.weight,
      }),
    )
    setRoute('done')
  }

  const submitFeedback = (fb: Rpe) => {
    setState((s) => {
      const delta = fb === 'easy' ? 0.1 : fb === 'hard' ? -0.1 : 0
      const next = lastRun ? trainingOps.setRpe(lastRun.id, fb)(s) : s
      return { ...next, intensity: Math.min(1.4, Math.max(0.7, Math.round((s.intensity + delta) * 100) / 100)) }
    })
    setActive(null)
    setRoute('main')
  }

  const trainedDates = [...new Set(completedSessions(state).map((x) => x.date))]

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
          streak={streak(trainedDates, today)}
          totalDays={trainedDates.length}
          onFeedback={submitFeedback}
        />
      )
      break
    default: {
      if (!ctx) {
        screen = <Welcome onStart={() => setRoute('assess')} />
        break
      }
      screen = (
        <div className="tabs-layout">
          <div className="tab-body">
            {tab === 'today' && (
              <Today
                ctx={ctx}
                state={state}
                today={today}
                apply={(op) => setState(op)}
                onStart={(w) => {
                  setActive(w)
                  setRoute('workout')
                }}
                onAsk={askCoach}
                onOpenTown={() => setTab('town')}
              />
            )}
            {tab === 'town' && (
              <Town
                state={state}
                today={today}
                workout={ctx.workout}
                apply={(op) => setState(op)}
                onGuided={(w) => {
                  setActive(w)
                  setRoute('workout')
                }}
              />
            )}
            {tab === 'coach' && <Coach chat={state.chat} sending={sending} onSend={sendChat} onClear={() => setState((s) => ({ ...s, chat: [] }))} />}
            {tab === 'progress' && <Progress ctx={ctx} state={state} today={today} />}
            {tab === 'me' && (
              <Me
                ctx={ctx}
                state={state}
                onRedo={() => setRoute('assess')}
                onReset={() => {
                  reset()
                  setRoute('welcome')
                }}
              />
            )}
          </div>
          <nav className="tabbar">
            {TABS.map(([k, label, d]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={d} />
                </svg>
                <span>{label}</span>
                {k === 'coach' && sending && tab !== 'coach' && <i className="tab-dot" />}
              </button>
            ))}
          </nav>
        </div>
      )
    }
  }

  return <div className="app">{screen}</div>
}
