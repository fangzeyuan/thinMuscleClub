import { useState } from 'react'
import { TAG_LABEL } from '@tmc/core/data/exercises'
import { DAY_INFO, PHASES, daysBetween, usesAppPlan, weekSchedule, weekdayIndex, type PlanCtx, type Workout } from '@tmc/core/plan'
import { activityById } from '@tmc/core/data/activities'
import { addDays, appToday, dateAt, dateLabel, isLateNight } from '@tmc/core/day'
import { PILLARS, dayProtein, dayScore, lastNDates, pillarProgress, sleepHours, targets, weightSeries, type Pillar } from '@tmc/core/pillars'
import { SLOT_LABEL, getDay, mondayOf, ops, uid, type AppState } from '../lib/store'
import { sessionMinutes, sessionTitle, trainingOps, type TrainingSession } from '@tmc/core/training'
import ExGlyph from './ExGlyph'
import EnergyCard from './EnergyCard'
import { energyOn, latestWeight, recentBalance } from '@tmc/core/energy'
import { BodySheet, MealSheet, Sheet, SleepSheet, WorkoutSheet } from './Sheets'
import MonthCalendar, { monthOf } from './MonthCalendar'

interface Props {
  ctx: PlanCtx
  state: AppState
  /** 真实的"今天"（凌晨 4 点换天） */
  today: string
  /** 正在查看的日期（默认今天；可以切到过去补录） */
  date: string
  onDate: (date: string) => void
  /** 需要更早的数据时按需加载 */
  onNeedDays: (from: string) => void
  apply: (op: (s: AppState) => AppState) => void
  onStart: (w: Workout) => void
  onAsk: (text: string) => void
  onOpenTown: () => void
}

const WD = ['一', '二', '三', '四', '五', '六', '日']

export const amountText = (w: Workout['items'][number]) =>
  (w.ex.mode === 'time' ? `${w.amount} 秒` : `${w.amount} 次`) + (w.ex.perSide ? ' / 侧' : '')

export default function Today({ ctx, state, today, date, onDate, onNeedDays, apply, onStart, onAsk, onOpenTown }: Props) {
  const { p, a, week, phase, schedule, kind, workout } = ctx
  const [sheet, setSheet] = useState<null | 'sleep' | 'meal' | 'body' | 'workout' | 'calendar'>(null)
  const [calMonth, setCalMonth] = useState(monthOf(date))
  const isToday = date === today
  const dayWord = isToday ? '今日' : '当天'
  const [showList, setShowList] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const d = getDay(state, date)
  const t = targets(p)
  const pr = pillarProgress(p, d, date)
  const score = dayScore(p, d, date)
  const hrs = sleepHours(d.sleep)
  const protein = dayProtein(d)
  const trained = d.sessions.length > 0
  // 课表按查看那天的星期几；"今日训练"卡片（课程、跟练）只在今天显示
  const viewKind = isToday ? kind : weekSchedule(p)[weekdayIndex(dateAt(date))]
  const isRest = viewKind === 'rest'
  const appPlan = usesAppPlan(p)
  const fromChat = (k: Pillar) =>
    k === 'sleep' ? d.sleep?.source === 'chat' : k === 'eat' ? d.meals.some((m) => m.source === 'chat') : k === 'train' ? d.sessions.some((x) => x.source === 'chat') : false

  const now = new Date()
  // 查看那天所在的一周（周一开头）
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(date), i))

  const hour = now.getHours()
  const greet = hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'

  const pillarValue: Record<Pillar, { main: string; sub: string }> = {
    sleep: { main: hrs === null ? '记录' : `${hrs}h`, sub: `目标 ${t.sleepH}h` },
    train: appPlan
      ? { main: trained ? '已完成' : isRest ? '休息日' : isToday ? '待训练' : '没有训练', sub: isRest && !trained ? '按计划休息也算' : DAY_INFO[viewKind].title }
      : { main: trained ? '已完成' : pr.train ? '节奏达标' : isToday ? '待训练' : '没有训练', sub: `本周 ${d.weekTrainedDays}/${p.days} 次` },
    eat: { main: d.meals.length ? `${protein}g` : '记录', sub: `蛋白质 / ${t.protein}g` },
    water: { main: d.water ? `${(d.water / 1000).toFixed(1)}L` : '0L', sub: `目标 ${(t.water / 1000).toFixed(1)}L` },
  }

  const tapPillar = (k: Pillar) => {
    if (k === 'sleep') setSheet('sleep')
    else if (k === 'eat') setSheet('meal')
    else if (k === 'train') !isToday ? setSheet('workout') : appPlan ? setShowList(true) : onOpenTown()
    else apply(ops.addWater(date, 250))
  }

  return (
    <div className="screen scroll today">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            {isToday ? `${greet} · 第 ${week}/${a.weeks} 周 · ${PHASES[phase].name}` : '查看 / 补录'}
          </p>
          <h1>{isToday ? '今天也薄一点' : dateLabel(date)}</h1>
          <button className="date-btn" onClick={() => setSheet('calendar')}>
            {isToday ? `${dateLabel(date)}${isLateNight(now) ? ' · 凌晨仍算今天' : ''}` : '换一天'}
          </button>
        </div>
        {!isToday && (
          <button className="back-today" onClick={() => onDate(today)}>
            回到今天
          </button>
        )}
      </header>

      {/* 本周日期条：点哪天看哪天；未来的日子不能点 */}
      <div className="date-strip">
        {weekDays.map((k, i) => {
          const day = getDay(state, k)
          const has = day.sessions.length > 0 || day.meals.length > 0 || day.water > 0 || !!day.sleep || day.weight != null
          return (
            <button key={k} className={`${k === date ? 'sel' : ''} ${k === today ? 'today' : ''}`} disabled={k > today || k < (state.startDate ?? k)} onClick={() => onDate(k)}>
              <span>{WD[i]}</span>
              <b>{Number(k.slice(8))}</b>
              <i className={has ? 'has' : ''} />
            </button>
          )
        })}
      </div>

      {isToday && <BedtimeNudge today={today} sleepTarget={t.sleepH} now={now} />}

      {!isToday && <p className="past-note">正在查看 {dateLabel(date)}，在这里的修改都会记到这一天。</p>}

      {/* 主视图：热量账本 */}
      <EnergyCard
        e={energyOn(state, date)}
        title={`${dayWord}热量`}
        balance={isToday ? recentBalance(state, lastNDates(8).slice(0, 7)) : null}
        onAddMeal={() => setSheet('meal')}
        onAsk={onAsk}
      />

      {/* 当前体重：最近一次记录 + 7 日平均 + 较开始 */}
      <WeightCard state={state} today={date} startWeight={p.weight} onRecord={() => setSheet('body')} />

      {/* 过程分：只衡量可控的四件事 */}
      <section className="card score-card">
        <ScoreRing score={score} parts={PILLARS.map((x) => ({ color: x.color, v: pr[x.k] ?? 0 }))} />
        <div className="score-text">
          <p className="eyebrow">{dayWord}过程分</p>
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
            <b>小薄的{dayWord}总结</b>
          </div>
          <p>{d.summary}</p>
          {isToday && (
            <button className="link" onClick={() => onAsk('再帮我更新一下今天的总结')}>
              更新总结 →
            </button>
          )}
        </section>
      ) : isToday && (
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

      {/* 训练：过去的某一天 → 当天的训练记录 + 补录 */}
      {!isToday && (
        <section className="card workout-card">
          <div className="wc-head">
            <div>
              <p className="eyebrow">当天训练{appPlan ? ` · 计划：${DAY_INFO[viewKind].title}` : ''}</p>
              <h2>{trained ? `练了 ${d.sessions.reduce((n, x) => n + sessionMinutes(x), 0)} 分钟` : '这天没有训练记录'}</h2>
            </div>
            {trained && <span className="chip done">已完成</span>}
          </div>
          {d.sessions.length > 0 && <SessionList sessions={d.sessions} onRemove={(id) => apply(trainingOps.remove(id))} />}
          <button className="btn ghost block top12" onClick={() => setSheet('workout')}>
            + 补录这天的训练
          </button>
        </section>
      )}

      {/* 训练：自己安排 → 只记录 */}
      {isToday && !appPlan && (
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
            <SessionList sessions={d.sessions} onRemove={(id) => apply(trainingOps.remove(id))} />
          ) : (
            <p className="muted small top8">练完去小镇记一笔，或者直接告诉小薄"今天练了胸，60 分钟"。</p>
          )}
          <button className="btn primary block top12" onClick={onOpenTown}>
            去小镇记录训练
          </button>
          <button className="link town-link" onClick={() => setSheet('workout')}>
            忘了计时？直接补录 →
          </button>
        </section>
      )}

      {/* 训练：App 排课 */}
      {isToday && appPlan && (
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
          <button className="link town-link" onClick={() => setSheet('workout')}>
            忘了计时？直接补录 →
          </button>
          {d.sessions.length > 0 && <SessionList sessions={d.sessions} onRemove={(id) => apply(trainingOps.remove(id))} />}
        </section>
      )}

      {/* 饮食 */}
      <section className="card">
        <h3>
          {dayWord}饮食 <small>蛋白质 {protein}/{t.protein}g</small>
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
                <button className="x" onClick={() => apply(ops.removeMeal(date, m.id))} aria-label="删除">
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
            apply(ops.setSleep(date, s))
            setSheet(null)
          }}
        />
      )}
      {sheet === 'meal' && (
        <MealSheet
          onClose={() => setSheet(null)}
          onSave={(m) => {
            apply(ops.addMeal(date, isToday ? { ...m, eatenAt: Date.now() } : m))
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
            apply((s) => ops.setWaist(date, wa)(ops.setWeight(date, w)(s)))
            setSheet(null)
          }}
        />
      )}
      {sheet === 'workout' && (
        <WorkoutSheet
          dateText={isToday ? '今天' : dateLabel(date)}
          onClose={() => setSheet(null)}
          onSave={(w) => {
            const facility = state.game.facilities.find((f) => f.kind === activityById(w.activityId).facility)
            apply(
              trainingOps.add({
                id: uid(),
                activityId: w.activityId,
                facilityId: facility?.id,
                source: 'manual',
                date,
                minutes: w.minutes,
                rpe: w.rpe,
                weightKg: latestWeight(state, date),
                // 今天补录算作刚结束；过去的日子记在当天晚上 8 点
                endAt: isToday ? Date.now() : dateAt(date).getTime() + 20 * 3600 * 1000,
              }),
            )
            setSheet(null)
          }}
        />
      )}
      {sheet === 'calendar' && (
        <Sheet title="选择日期" onClose={() => setSheet(null)}>
          <MonthCalendar
            state={state}
            month={calMonth}
            today={today}
            selected={date}
            min={state.startDate ?? today}
            onMonth={(m) => {
              setCalMonth(m)
              onNeedDays(`${m}-01`)
            }}
            onSelect={(d) => {
              onDate(d)
              setSheet(null)
            }}
          />
        </Sheet>
      )}
    </div>
  )
}

/** 当天的训练记录，可以删除（补录错了、或重复记录） */
function SessionList({ sessions, onRemove }: { sessions: TrainingSession[]; onRemove: (id: string) => void }) {
  const [confirm, setConfirm] = useState<string | null>(null)
  return (
    <ul className="mini-log">
      {sessions.map((x) => (
        <li key={x.id}>
          {sessionTitle(x)} · {sessionMinutes(x)} 分钟
          {x.source === 'chat' && <span className="ai-tag">AI</span>}
          {x.source === 'manual' && <span className="ai-tag manual">补录</span>}
          {confirm === x.id ? (
            <button className="x confirm-del" onClick={() => onRemove(x.id)}>
              确认删除
            </button>
          ) : (
            <button className="x" onClick={() => setConfirm(x.id)} aria-label="删除">
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
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
  const isToday = today === appToday()
  const when = ago === 0 ? (isToday ? '今天' : '当天') : ago != null ? `${ago} 天前的记录` : '测评时'
  const waist = last ? state.days[last].waist : undefined

  return (
    <button className="card weight-card" onClick={onRecord}>
      <div className="wc-main">
        <span className="eyebrow">{isToday ? '当前体重' : '体重'} · {when}</span>
        <b>
          {current.toFixed(1)}
          <small> kg</small>
        </b>
        <span className="wc-cta">
          {isToday ? (ago === 0 ? '修改今日体重' : '记录今日体重') : ago === 0 ? '修改这天的体重' : '补录这天的体重'}
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

/**
 * 23:00–03:59 的睡觉提醒：睡好也是薄肌的一部分。
 * 点"好，准备睡了"后当晚不再出现（按"今天"记在本机）。
 */
function BedtimeNudge({ today, sleepTarget, now }: { today: string; sleepTarget: number; now: Date }) {
  const key = `tmc:bedtime-nudge:${today}`
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })
  const h = now.getHours()
  if (dismissed || (h < 23 && h >= 4)) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  const wake = new Date(now.getTime() + sleepTarget * 3600 * 1000)
  return (
    <section className="card bedtime">
      <span className="moon">☾</span>
      <div>
        <b>已经 {pad(h)}:{pad(now.getMinutes())} 了，早点睡吧</b>
        <p>
          睡好也是薄肌的一部分：睡不够第二天更容易饿、更难管住嘴，肌肉也恢复得慢。现在睡，{pad(wake.getHours())}:{pad(wake.getMinutes())} 起床刚好睡够 {sleepTarget} 小时。
        </p>
        <button
          onClick={() => {
            try {
              localStorage.setItem(key, '1')
            } catch {
              // 存储不可用时只在本次隐藏
            }
            setDismissed(true)
          }}
        >
          好，准备睡了
        </button>
      </div>
    </section>
  )
}
