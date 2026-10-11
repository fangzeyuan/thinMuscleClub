import { useState } from 'react'
import { DAY_INFO, type PlanCtx } from '@tmc/core/plan'
import { EXPECTATIONS, PILLARS, dayProtein, dayScore, expectationIndex, lastNDates, pillarProgress, sleepHours, targets, weightSeries } from '@tmc/core/pillars'
import { getDay, type AppState } from '../lib/store'
import { completedSessions, sessionMinutes } from '@tmc/core/training'

const WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export default function Progress({ ctx, state, today }: { ctx: PlanCtx; state: AppState; today: string }) {
  const { p, a, week, schedule } = ctx
  const t = targets(p)
  const ei = expectationIndex(week)
  const startDate = state.startDate!

  const d14 = lastNDates(14).filter((d) => d >= startDate)
  const last7 = lastNDates(7)
  const prev7 = lastNDates(14).slice(0, 7)

  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null)
    return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null
  }
  const sleep7 = avg(last7.map((d) => sleepHours(getDay(state, d).sleep)))
  const sleepPrev = avg(prev7.map((d) => sleepHours(getDay(state, d).sleep)))
  const allDays = Object.entries(state.days)
  const done = completedSessions(state)
  const workouts = done.length
  const minutes = done.reduce((m, x) => m + sessionMinutes(x), 0)
  const proteinDays = allDays.filter(([, d]) => dayProtein(d) >= t.protein * 0.9).length
  const waterDays = allDays.filter(([, d]) => d.water >= t.water).length
  const score7 = avg(last7.filter((d) => d >= startDate && d <= today).map((d) => dayScore(p, getDay(state, d), d)))

  const wins: { v: string; l: string; hint?: string }[] = [
    { v: `${workouts}`, l: '累计训练', hint: `${minutes} 分钟` },
    { v: score7 != null ? `${Math.round(score7)}` : '-', l: '7 日平均过程分' },
    {
      v: sleep7 != null ? `${sleep7}h` : '-',
      l: '近 7 天平均睡眠',
      hint: sleep7 != null && sleepPrev != null ? `${sleep7 >= sleepPrev ? '+' : ''}${Math.round((sleep7 - sleepPrev) * 60)} 分钟` : undefined,
    },
    { v: `${proteinDays}`, l: '蛋白质达标天数' },
    { v: `${waterDays}`, l: '喝水达标天数' },
  ].filter((w, i) => i === 0 || (w.v !== '0' && w.v !== '-'))

  return (
    <div className="screen scroll progress">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            第 {week}/{a.weeks} 周
          </p>
          <h1>看得见的进展</h1>
        </div>
      </header>

      <section className="card">
        <h3>你现在在哪</h3>
        <p className="note">身体的变化有固定的顺序。先看过程，再看结果。</p>
        <ol className="timeline">
          {EXPECTATIONS.map((e, i) => (
            <li key={e.week} className={i < ei ? 'past' : i === ei ? 'now' : ''}>
              <b>
                {e.title}
                {i === ei && <em>你在这里</em>}
              </b>
              {i === ei && <p>{e.body}</p>}
              <span>{e.visible}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h3>隐形进步</h3>
        <p className="note">镜子还没反应时，这些数字已经在变了。</p>
        <div className="wins">
          {wins.map((w) => (
            <div key={w.l}>
              <b>{w.v}</b>
              <span>{w.l}</span>
              {w.hint && <em>{w.hint}</em>}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>
          过程打卡 <small>近 {d14.length} 天</small>
        </h3>
        <Heatmap state={state} dates={d14} />
      </section>

      <section className="card">
        <h3>
          体重趋势 <small>7 日平均</small>
        </h3>
        <WeightChart state={state} start={startDate} />
        <p className="note calm">浅色点是每天的体重，绿线是 7 日平均。只要绿线的大方向对，单日的起伏都不用在意。</p>
      </section>

      <section className="card">
        <h3>本周训练安排</h3>
        <ul className="sched">
          {schedule.map((k, i) => (
            <li key={i} className={`${i === (new Date().getDay() + 6) % 7 ? 'today' : ''} ${k === 'rest' ? 'rest' : ''}`}>
              <span className="sched-day">{WD[i]}</span>
              <div>
                <b>{DAY_INFO[k].title}</b>
                <span>{DAY_INFO[k].sub}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Heatmap({ state, dates }: { state: AppState; dates: string[] }) {
  const p = state.profile!
  const [tip, setTip] = useState<string | null>(null)
  if (!dates.length) return <p className="muted small top8">开始记录后，这里会显示每天的完成情况。</p>
  return (
    <>
      <div className="heat" style={{ gridTemplateColumns: `28px repeat(${dates.length}, 1fr)` }}>
        {PILLARS.map((x) => (
          <div key={x.k} className="heat-row" style={{ display: 'contents' }}>
            <span className="heat-label">{x.name}</span>
            {dates.map((d) => {
              const v = pillarProgress(p, getDay(state, d), d)[x.k]
              const level = v == null ? 0 : v >= 0.9 ? 3 : v >= 0.5 ? 2 : v > 0 ? 1 : 0
              return (
                <button
                  key={d}
                  className={`heat-cell l${level}`}
                  style={{ ['--pc' as string]: x.color }}
                  aria-label={`${d} ${x.name} ${v == null ? '未记录' : Math.round(v * 100) + '%'}`}
                  onClick={() => setTip(`${d.slice(5)} · ${x.name}：${v == null ? '未记录' : `完成 ${Math.round(v * 100)}%`}`)}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="heat-foot">
        <span>{tip ?? `${dates[0].slice(5)} → 今天`}</span>
        <span className="heat-legend">
          未记录 <i className="l0" /> <i className="l1" /> <i className="l2" /> <i className="l3" /> 达标
        </span>
      </div>
    </>
  )
}

function WeightChart({ state, start }: { state: AppState; start: string }) {
  const dates = lastNDates(30).filter((d) => d >= start)
  const series = weightSeries(state, dates)
  const [hover, setHover] = useState<number | null>(null)
  const vals = series.flatMap((s) => [s.raw, s.avg]).filter((v): v is number => v != null)
  if (vals.length < 1) return <p className="muted small top8">记录体重后会显示趋势。建议每天早上空腹称。</p>

  const W = 320
  const H = 140
  const pad = { l: 34, r: 8, t: 10, b: 20 }
  const lo = Math.floor(Math.min(...vals) - 0.5)
  const hi = Math.ceil(Math.max(...vals) + 0.5)
  const x = (i: number) => pad.l + (dates.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (dates.length - 1)) * (W - pad.l - pad.r))
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b)
  const avgPts = series.map((s, i) => (s.avg != null ? `${x(i)},${y(s.avg)}` : null)).filter(Boolean)
  const h = hover != null ? series[hover] : null

  return (
    <div className="wchart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const px = ((e.clientX - r.left) / r.width) * W
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (dates.length - 1))
          setHover(Math.max(0, Math.min(dates.length - 1, i)))
        }}
        onPointerLeave={() => setHover(null)}
      >
        {[lo, (lo + hi) / 2, hi].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={pad.l - 6} y={y(v) + 3.5} className="axis" textAnchor="end">
              {v % 1 ? v.toFixed(1) : v}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 4} className="axis">
          {dates[0].slice(5)}
        </text>
        <text x={W - pad.r} y={H - 4} className="axis" textAnchor="end">
          今天
        </text>
        {series.map((s, i) => s.raw != null && <circle key={i} cx={x(i)} cy={y(s.raw)} r="3" className="raw" />)}
        {avgPts.length > 1 && <polyline points={avgPts.join(' ')} className="avg" />}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="cross" />}
        {h?.avg != null && <circle cx={x(hover!)} cy={y(h.avg)} r="4.5" className="avg-dot" />}
      </svg>
      {h && (
        <div className="wtip" style={{ left: `${(x(hover!) / W) * 100}%` }}>
          <b>{h.date.slice(5)}</b>
          <span>当天 {h.raw ?? '-'} kg</span>
          <span>7 日均 {h.avg ?? '-'} kg</span>
        </div>
      )}
    </div>
  )
}
