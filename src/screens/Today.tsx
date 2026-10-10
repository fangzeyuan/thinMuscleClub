import { useState } from 'react'
import { TAG_LABEL } from '../data/exercises'
import { DAY_INFO, MEAL_TIPS, PHASES, buildWorkout, dateKey, palmGuide, type PlanCtx, type Workout } from '../lib/plan'
import type { AppState } from '../lib/store'
import { streak } from '../lib/store'
import ExGlyph from './ExGlyph'

interface Props {
  ctx: PlanCtx
  state: AppState
  today: string
  onStart: (w: Workout) => void
  onToggleMeal: (i: number) => void
}

const WD = ['一', '二', '三', '四', '五', '六', '日']

export const amountText = (w: Workout['items'][number]) =>
  (w.ex.mode === 'time' ? `${w.amount} 秒` : `${w.amount} 次`) + (w.ex.perSide ? ' / 侧' : '')

export default function Today({ ctx, state, today, onStart, onToggleMeal }: Props) {
  const { p, a, week, phase, schedule, kind, workout, dayIdx } = ctx
  const [open, setOpen] = useState<string | null>(null)
  const [extra, setExtra] = useState(false)
  const doneToday = state.logs.some((l) => l.date === today)
  const meals = state.meals[today] ?? [false, false, false]
  const palm = palmGuide(p, a)
  const dates = new Set(state.logs.map((l) => l.date))

  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })

  const isRest = kind === 'rest'
  const shown = isRest && extra ? workout : isRest ? null : workout
  const tips = MEAL_TIPS[a.type]
  const totalKcal = state.logs.reduce((s, l) => s + l.kcal, 0)
  const hour = now.getHours()
  const greet = hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'

  return (
    <div className="screen scroll today">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            {greet} · 第 {week}/{a.weeks} 周
          </p>
          <h1>今天也薄一点</h1>
        </div>
        <span className="chip accent">{PHASES[phase].name}</span>
      </header>

      <div className="week-strip">
        {weekDays.map((d, i) => {
          const k = dateKey(d)
          const isToday = k === today
          return (
            <div key={i} className={`ws ${isToday ? 'today' : ''} ${dates.has(k) ? 'done' : ''}`}>
              <span>{WD[i]}</span>
              <b>{d.getDate()}</b>
              <i className={schedule[i] === 'rest' ? 'rest' : ''} />
            </div>
          )
        })}
      </div>

      {shown ? (
        <section className="card workout-card">
          <div className="wc-head">
            <div>
              <p className="eyebrow">{isRest ? '休息日加练' : '今日训练'}</p>
              <h2>{shown.title}</h2>
              <p className="muted">{DAY_INFO[shown.kind].sub}</p>
            </div>
            {doneToday && <span className="chip done">已完成</span>}
          </div>
          <div className="wc-meta">
            <div>
              <b>{shown.estMin}</b>
              <span>分钟</span>
            </div>
            <div>
              <b>{shown.items.length}×{shown.rounds}</b>
              <span>动作×轮</span>
            </div>
            <div>
              <b>{shown.kcal}</b>
              <span>千卡</span>
            </div>
          </div>
          <ul className="ex-list">
            {shown.items.map((it) => (
              <li key={it.ex.id} className={open === it.ex.id ? 'open' : ''} onClick={() => setOpen(open === it.ex.id ? null : it.ex.id)}>
                <ExGlyph tag={it.ex.tags[0]} size={40} />
                <div className="ex-main">
                  <b>{it.ex.name}</b>
                  <span>
                    {it.ex.tags.slice(0, 2).map((t) => TAG_LABEL[t]).join(' · ')}
                    {it.ex.equip === 'band' && ' · 弹力带'}
                    {it.ex.equip === 'dumbbell' && ' · 哑铃'}
                  </span>
                  {open === it.ex.id && (
                    <ul className="cues">
                      {it.ex.cues.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <em>{amountText(it)}</em>
              </li>
            ))}
          </ul>
          <button className="btn primary block" onClick={() => onStart(shown)}>
            {doneToday ? '再练一次' : '开始训练'}
          </button>
        </section>
      ) : (
        <section className="card rest-card">
          <p className="eyebrow">今日安排</p>
          <h2>主动恢复日</h2>
          <p className="muted">肌肉在休息时生长。今天散步 30 分钟，或者做 10 分钟拉伸就很好。</p>
          <div className="rest-actions">
            <button className="btn ghost" onClick={() => setExtra(true)}>
              想动一动？来组加练
            </button>
          </div>
          <NextUp ctx={ctx} />
        </section>
      )}

      <section className="card">
        <h3>
          今日饮食 <small>蛋白质 {a.protein} g</small>
        </h3>
        <p className="note">每餐吃够 {palm.protein} 掌心蛋白质（肉、蛋、鱼、豆腐），吃完点一下：</p>
        <div className="meal-row">
          {['早餐', '午餐', '晚餐'].map((m, i) => (
            <button key={m} className={`meal ${meals[i] ? 'on' : ''}`} onClick={() => onToggleMeal(i)}>
              <span className="meal-check">{meals[i] ? '✓' : ''}</span>
              {m}
            </button>
          ))}
        </div>
        <div className="tip">
          <b>今日小贴士</b>
          {tips[dayIdx % tips.length]}
        </div>
      </section>

      <section className="stats3">
        <div>
          <b>{streak([...dates], today)}</b>
          <span>连续天数</span>
        </div>
        <div>
          <b>{dates.size}</b>
          <span>累计训练</span>
        </div>
        <div>
          <b>{totalKcal}</b>
          <span>累计千卡</span>
        </div>
      </section>
    </div>
  )
}

function NextUp({ ctx }: { ctx: PlanCtx }) {
  const today = (new Date().getDay() + 6) % 7
  for (let i = 1; i <= 7; i++) {
    const k = ctx.schedule[(today + i) % 7]
    if (k !== 'rest') {
      const w = buildWorkout(ctx.p, k, ctx.dayIdx + 1 + i, ctx.phase, 1)
      return (
        <div className="next-up">
          <span>{i === 1 ? '明天' : `${i} 天后`}</span>
          <b>{w.title}</b>
          <em>约 {w.estMin} 分钟</em>
        </div>
      )
    }
  }
  return null
}
