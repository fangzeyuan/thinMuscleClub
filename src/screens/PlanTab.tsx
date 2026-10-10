import { BODY_TYPE_INFO, DAY_INFO, PHASES, TARGET_INFO, buildWorkout, palmGuide, phaseOf, type PlanCtx } from '../lib/plan'
import type { WorkoutLog } from '../lib/store'
import FatBar from './FatBar'

const WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export default function PlanTab({ ctx, logs }: { ctx: PlanCtx; logs: WorkoutLog[] }) {
  const { p, a, week, phase, schedule, dayIdx } = ctx
  const info = BODY_TYPE_INFO[a.type]
  const palm = palmGuide(p, a)
  const todayW = (new Date().getDay() + 6) % 7
  const trainedDays = new Set(logs.map((l) => l.date)).size
  const plannedSoFar = Math.max(1, Math.round(((dayIdx + 1) / 7) * p.days))
  const p2End = Math.ceil(a.weeks * 0.6)

  return (
    <div className="screen scroll plan">
      <header className="page-head">
        <div>
          <p className="eyebrow">我的计划</p>
          <h1>{info.name}</h1>
        </div>
        <span className="chip">{a.weeks} 周</span>
      </header>

      <section className="card">
        <div className="journey">
          <div className="journey-bar">
            <div style={{ width: `${(week / a.weeks) * 100}%` }} />
            <span className="seg-mark" style={{ left: `${(2 / a.weeks) * 100}%` }} />
            <span className="seg-mark" style={{ left: `${(p2End / a.weeks) * 100}%` }} />
          </div>
          <div className="journey-labels">
            {PHASES.map((ph, i) => (
              <span key={ph.name} className={i === phase ? 'on' : ''}>
                {ph.name}
              </span>
            ))}
          </div>
        </div>
        <div className="stat-row">
          <div>
            <span>当前</span>
            <b>
              第 {week}
              <small>周</small>
            </b>
          </div>
          <div>
            <span>完成率</span>
            <b>{Math.min(100, Math.round((trainedDays / plannedSoFar) * 100))}%</b>
          </div>
          <div>
            <span>重点</span>
            <b className="small">{p.targets.map((t) => TARGET_INFO[t].label.split(' ')[0]).join(' ')}</b>
          </div>
        </div>
        <p className="note">{PHASES[phase].desc}</p>
      </section>

      <section className="card">
        <h3>本周训练</h3>
        <ul className="sched">
          {schedule.map((k, i) => {
            const w = k === 'rest' ? null : buildWorkout(p, k, dayIdx + 1 + (i - todayW), phaseOf(week, a.weeks), 1)
            return (
              <li key={i} className={`${i === todayW ? 'today' : ''} ${k === 'rest' ? 'rest' : ''}`}>
                <span className="sched-day">{WD[i]}</span>
                <div>
                  <b>{DAY_INFO[k].title}</b>
                  <span>{w ? `${w.items.map((x) => x.ex.name).slice(0, 3).join('、')}…` : DAY_INFO.rest.sub}</span>
                </div>
                {w && <em>{w.estMin}′</em>}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card">
        <h3>身体数据</h3>
        <FatBar sex={p.sex} value={a.bodyFat} range={a.targetFat} />
        <div className="goal-line">
          <span>估算体脂</span>
          <b>
            {a.bodyFat}% → {a.targetFat[0]}–{a.targetFat[1]}%
          </b>
        </div>
        <div className="goal-line">
          <span>每日热量</span>
          <b>约 {a.kcal} kcal</b>
        </div>
        <div className="goal-line">
          <span>每餐</span>
          <b>
            蛋白质 {palm.protein} 掌 · 主食 {palm.carbs} 拳 · 蔬菜 {palm.veg} 拳
          </b>
        </div>
        <p className="note">{info.strategy}</p>
      </section>
    </div>
  )
}
