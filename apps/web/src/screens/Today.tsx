import { useState } from 'react'
import { TAG_LABEL } from '@tmc/core/data/exercises'
import { DAY_INFO, PHASES, dateKey, daysBetween, usesAppPlan, type PlanCtx, type Workout } from '@tmc/core/plan'
import { PILLARS, dayProtein, dayScore, lastNDates, pillarProgress, sleepHours, targets, weightSeries, type Pillar } from '@tmc/core/pillars'
import { SLOT_LABEL, getDay, ops, type AppState } from '../lib/store'
import { sessionMinutes, sessionTitle } from '@tmc/core/training'
import ExGlyph from './ExGlyph'
import EnergyCard from './EnergyCard'
import { energyOn, recentBalance } from '@tmc/core/energy'
import { BodySheet, MealSheet, SleepSheet } from './Sheets'

interface Props {
  ctx: PlanCtx
  state: AppState
  today: string
  apply: (op: (s: AppState) => AppState) => void
  onStart: (w: Workout) => void
  onAsk: (text: string) => void
  onOpenTown: () => void
}

const WD = ['一', '二', '三', '四', '五', '六', '日']

export const amountText = (w: Workout['items'][number]) =>
  (w.ex.mode === 'time' ? `${w.amount} 秒` : `${w.amount} 次`) + (w.ex.perSide ? ' / 侧' : '')

export default function Today({ ctx, state, today, apply, onStart, onAsk, onOpenTown }: Props) {
  const { p, a, week, phase, schedule, kind, workout } = ctx
  const [sheet, setSheet] = useState<null | 'sleep' | 'meal' | 'body'>(null)
  const [showList, setShowList] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const d = getDay(state, today)
  const t = targets(p)
  const pr = pillarProgress(p, d, today)
  const score = dayScore(p, d, today)
  const hrs = sleepHours(d.sleep)
  const protein = dayProtein(d)
  const trained = d.sessions.length > 0
  const isRest = kind === 'rest'
  const appPlan = usesAppPlan(p)
  const fromChat = (k: Pillar) =>
    k === 'sleep' ? d.sleep?.source === 'chat' : k === 'eat' ? d.meals.some((m) => m.source === 'chat') : k === 'train' ? d.sessions.some((x) => x.source === 'chat') : false

  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday)
    x.setDate(monday.getDate() + i)
    return dateKey(x)
  })

  const hour = now.getHours()
  const greet = hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'

  const pillarValue: Record<Pillar, { main: string; sub: string }> = {
    sleep: { main: hrs === null ? '记录' : `${hrs}h`, sub: `目标 ${t.sleepH}h` },
    train: appPlan
      ? { main: trained ? '已完成' : isRest ? '休息日' : '待训练', sub: isRest && !trained ? '按计划休息也算' : DAY_INFO[kind].title }
      : { main: trained ? '已完成' : pr.train ? '节奏达标' : '待训练', sub: `本周 ${d.weekTrainedDays}/${p.days} 次` },
    eat: { main: d.meals.length ? `${protein}g` : '记录', sub: `蛋白质 / ${t.protein}g` },
    water: { main: d.water ? `${(d.water / 1000).toFixed(1)}L` : '0L', sub: `目标 ${(t.water / 1000).toFixed(1)}L` },
  }

  const tapPillar = (k: Pillar) => {
    if (k === 'sleep') setSheet('sleep')
    else if (k === 'eat') setSheet('meal')
    else if (k === 'train') appPlan ? setShowList(true) : onOpenTown()
    else apply(ops.addWater(today, 250))
  }

  return (
    <div className="screen scroll today">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            {greet} · 第 {week}/{a.weeks} 周 · {PHASES[phase].name}
          </p>
          <h1>今天也薄一点</h1>
        </div>
      </header>

      {/* 主视图：热量账本 */}
      <EnergyCard
        e={energyOn(state, today)}
        balance={recentBalance(state, lastNDates(8).slice(0, 7))}
        onAddMeal={() => setSheet('meal')}
        onAsk={onAsk}
      />

      {/* 当前体重：最近一次记录 + 7 日平均 + 较开始 */}
      <WeightCard state={state} today={today} startWeight={p.weight} onRecord={() => setSheet('body')} />

      {/* 过程分：只衡量可控的四件事 */}
      <section className="card score-card">
        <ScoreRing score={score} parts={PILLARS.map((x) => ({ color: x.color, v: pr[x.k] ?? 0 }))} />
        <div className="score-text">
          <p className="eyebrow">今日过程分</p>
          <p className="score-line">
            {score >= 90 ? '完美的一天，结果会跟上来的' : score >= 60 ? '节奏很稳，继续保持' : score > 0 ? '每做一件都在加分' : '从一杯水开始就好'}
          </p>
          <p className="muted small">体重不计分，只看你能控制的事</p>
        </div>
      </section>

      <div className="pillars">
        {PILLARS.map((x) => {
          const v = pr[x.k]
          return (
            <button key={x.k} className="pillar" onClick={() => tapPillar(x.k)} style={{ ['--pc' as string]: x.color }}>
              <div className="pillar-top">
                <span className="pillar-name">
                  <i>{x.icon}</i>
                  {x.name}
                </span>
                {fromChat(x.k) && <span className="ai-tag">AI 同步</span>}
                {x.k === 'water' && <span className="plus">+250</span>}
              </div>
              <b>{pillarValue[x.k].main}</b>
              <span className="pillar-sub">{pillarValue[x.k].sub}</span>
              <div className="pillar-bar">
                <div style={{ width: `${(v ?? 0) * 100}%` }} />
              </div>
            </button>
          )
        })}
      </div>

      {/* AI 每日总结 */}
      {d.summary ? (
        <section className="card summary-card">
          <div className="summary-head">
            <span className="avatar">薄</span>
            <b>小薄的今日总结</b>
          </div>
          <p>{d.summary}</p>
          <button className="link" onClick={() => onAsk('再帮我更新一下今天的总结')}>
            更新总结 →
          </button>
        </section>
      ) : (
        <section className="card ask-card">
          <div className="summary-head">
            <span className="avatar">薄</span>
            <div>
              <b>不想一项项点？直接告诉小薄</b>
              <p className="muted small">说一句话，自动同步到睡、练、吃、水</p>
            </div>
          </div>
          <div className="chips">
            {(hour >= 19 ? ['帮我做今日总结', '我今天好像没什么进步'] : ['昨晚 12 点睡，7 点起', '早餐吃了两个鸡蛋一杯豆浆']).map((q) => (
              <button key={q} className="chip-btn" onClick={() => onAsk(q)}>
                {q}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 训练：自己安排 → 只记录 */}
      {!appPlan && (
        <section className="card workout-card">
          <div className="wc-head">
            <div>
              <p className="eyebrow">今日训练 · 按你自己的计划</p>
              <h2>{trained ? '今天已经练过了' : '今天练了吗？'}</h2>
              <p className="muted">
                本周已练 {d.weekTrainedDays}/{p.days} 次{pr.train && !trained ? '，节奏达标，休息也没关系' : ''}
              </p>
            </div>
            {trained && <span className="chip done">已完成</span>}
          </div>
          <div className="week-strip mini">
            {weekDays.map((k, i) => (
              <div key={k} className={`ws ${k === today ? 'today' : ''} ${getDay(state, k).sessions.length ? 'done' : ''}`}>
                <span>{WD[i]}</span>
                <b>{getDay(state, k).sessions.length ? '✓' : ''}</b>
              </div>
            ))}
          </div>
          {d.sessions.length > 0 ? (
            <ul className="mini-log">
              {d.sessions.map((x) => (
                <li key={x.id}>
                  {sessionTitle(x)} · {sessionMinutes(x)} 分钟{x.source === 'chat' && <span className="ai-tag">AI</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small top8">练完去小镇记一笔，或者直接告诉小薄"今天练了胸，60 分钟"。</p>
          )}
          <button className="btn primary block top12" onClick={onOpenTown}>
            去小镇记录训练
          </button>
        </section>
      )}

      {/* 训练：App 排课 */}
      {appPlan && (
        <section className="card workout-card">
          <div className="wc-head">
            <div>
              <p className="eyebrow">{isRest ? '今天是休息日 · 可选加练' : '今日训练'}</p>
              <h2>{workout.title}</h2>
              <p className="muted">
                {DAY_INFO[workout.kind].sub} · {workout.estMin} 分钟 · {workout.kcal} 千卡
              </p>
            </div>
            {trained && <span className="chip done">已完成</span>}
          </div>
          <div className="week-strip mini">
            {weekDays.map((k, i) => (
              <div key={k} className={`ws ${k === today ? 'today' : ''} ${getDay(state, k).sessions.length ? 'done' : ''} ${schedule[i] === 'rest' ? 'rest' : ''}`}>
                <span>{WD[i]}</span>
                <b>{getDay(state, k).sessions.length ? '✓' : schedule[i] === 'rest' ? '·' : ''}</b>
              </div>
            ))}
          </div>
          {showList && (
            <ul className="ex-list">
              {workout.items.map((it) => (
                <li key={it.ex.id} onClick={() => setOpen(open === it.ex.id ? null : it.ex.id)}>
                  <ExGlyph tag={it.ex.tags[0]} size={40} />
                  <div className="ex-main">
                    <b>{it.ex.name}</b>
                    <span>{it.ex.tags.slice(0, 2).map((x) => TAG_LABEL[x]).join(' · ')}</span>
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
          )}
          <div className="row-btns">
            <button className="btn ghost" onClick={() => setShowList(!showList)}>
              {showList ? '收起' : `${workout.items.length} 个动作 × ${workout.rounds} 轮`}
            </button>
            <button className={`btn ${isRest && !trained ? 'ghost' : 'primary'}`} onClick={() => onStart(workout)}>
              {trained ? '再练一次' : isRest ? '加练' : '开始训练'}
            </button>
          </div>
          <button className="link town-link" onClick={onOpenTown}>
            游泳、跑步、健身房？去小镇记录 →
          </button>
          {d.sessions.length > 0 && (
            <ul className="mini-log">
              {d.sessions.map((x) => (
                <li key={x.id}>
                  {sessionTitle(x)} · {sessionMinutes(x)} 分钟{x.source === 'chat' && <span className="ai-tag">AI</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 饮食 */}
      <section className="card">
        <h3>
          今日饮食 <small>蛋白质 {protein}/{t.protein}g</small>
        </h3>
        {d.meals.length === 0 ? (
          <p className="muted small top8">还没有记录。每餐吃够 1–2 掌心蛋白质就很好。</p>
        ) : (
          <ul className="meals">
            {d.meals.map((m) => (
              <li key={m.id}>
                <span className="slot">{SLOT_LABEL[m.slot]}</span>
                <div>
                  <b>{m.text}</b>
                  <span>
                    蛋白 {m.protein ?? 0}g{m.kcal ? ` · ${m.kcal} kcal` : ''}
                    {m.source === 'chat' && <span className="ai-tag">AI</span>}
                  </span>
                </div>
                <button className="x" onClick={() => apply(ops.removeMeal(today, m.id))} aria-label="删除">
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className="btn ghost block top12" onClick={() => setSheet('meal')}>
          + 记一餐
        </button>
      </section>

      {sheet === 'sleep' && (
        <SleepSheet
          value={d.sleep}
          onClose={() => setSheet(null)}
          onSave={(s) => {
            apply(ops.setSleep(today, s))
            setSheet(null)
          }}
        />
      )}
      {sheet === 'meal' && (
        <MealSheet
          onClose={() => setSheet(null)}
          onSave={(m) => {
            apply(ops.addMeal(today, m))
            setSheet(null)
          }}
        />
      )}
      {sheet === 'body' && (
        <BodySheet
          weight={d.weight}
          waist={d.waist}
          onClose={() => setSheet(null)}
          onSave={(w, wa) => {
            apply((s) => ops.setWaist(today, wa)(ops.setWeight(today, w)(s)))
            setSheet(null)
          }}
        />
      )}
    </div>
  )
}

/** 四段环：每段代表一个支柱 */
function ScoreRing({ score, parts }: { score: number; parts: { color: string; v: number }[] }) {
  const r = 38
  const c = 2 * Math.PI * r
  const seg = c / 4
  const gap = 5
  return (
    <div className="score-ring">
      <svg viewBox="0 0 96 96" width="96" height="96">
        {parts.map((p, i) => (
          <g key={i} transform={`rotate(${-90 + i * 90} 48 48)`}>
            <circle cx="48" cy="48" r={r} fill="none" stroke="var(--line)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${seg - gap} ${c}`} />
            {p.v > 0 && (
              <circle
                cx="48"
                cy="48"
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0.01, (seg - gap) * p.v)} ${c}`}
                style={{ transition: 'stroke-dasharray .5s ease' }}
              />
            )}
          </g>
        ))}
      </svg>
      <b>{score}</b>
    </div>
  )
}

/** 当前体重卡片。只展示事实，不用红绿色评价涨跌（单日波动很正常，看 7 日平均） */
function WeightCard({ state, today, startWeight, onRecord }: { state: AppState; today: string; startWeight: number; onRecord: () => void }) {
  const last = Object.keys(state.days)
    .filter((k) => k <= today && state.days[k].weight != null)
    .sort()
    .at(-1)
  const current = last ? state.days[last].weight! : startWeight
  const avg = weightSeries(state, [today])[0].avg
  const delta = Math.round((current - startWeight) * 10) / 10
  const ago = last ? daysBetween(last, today) : null
  const when = ago === 0 ? '今天' : ago === 1 ? '昨天' : ago != null ? `${ago} 天前` : '测评时'
  const waist = last ? state.days[last].waist : undefined

  return (
    <button className="card weight-card" onClick={onRecord}>
      <div className="wc-main">
        <span className="eyebrow">当前体重 · {when}</span>
        <b>
          {current.toFixed(1)}
          <small> kg</small>
        </b>
        <span className="wc-cta">
          {ago === 0 ? '修改今日体重' : '记录今日体重'}
          {waist != null && <span className="muted"> · 腰围 {waist} cm</span>}
        </span>
      </div>
      <div className="wc-side">
        <div>
          <span>7 日平均</span>
          <b>{avg != null ? avg.toFixed(1) : '-'}</b>
        </div>
        <div>
          <span>较开始</span>
          <b>{delta === 0 ? '±0' : delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}</b>
        </div>
      </div>
    </button>
  )
}
