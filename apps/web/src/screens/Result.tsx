import { BODY_TYPE_INFO, DAY_INFO, PHASES, TARGET_INFO, assess, palmGuide, weekSchedule, type Profile } from '@tmc/core/plan'
import FatBar from './FatBar'

const WD = ['一', '二', '三', '四', '五', '六', '日']

export default function Result({ profile: p, onStart, onRedo }: { profile: Profile; onStart: () => void; onRedo: () => void }) {
  const a = assess(p)
  const info = BODY_TYPE_INFO[a.type]
  const palm = palmGuide(p, a)
  const sched = weekSchedule(p)
  const diff = Math.round((a.targetWeight - p.weight) * 10) / 10

  return (
    <div className="screen result scroll">
      <div className="result-hero">
        <p className="eyebrow">你的薄肌类型</p>
        <h1>{info.name}</h1>
        <p className="slogan">{info.slogan}</p>
      </div>

      <section className="card">
        <div className="stat-row">
          <div>
            <span>BMI</span>
            <b>{a.bmi}</b>
          </div>
          <div>
            <span>估算体脂</span>
            <b>{a.bodyFat}%</b>
          </div>
          <div>
            <span>预计周期</span>
            <b>
              {a.weeks}
              <small>周</small>
            </b>
          </div>
        </div>
        <FatBar sex={p.sex} value={a.bodyFat} range={a.targetFat} />
        <p className="note">{info.strategy}</p>
      </section>

      <section className="card">
        <h3>目标</h3>
        <div className="goal-line">
          <span>体脂</span>
          <b>
            {a.bodyFat}% → {a.targetFat[0]}–{a.targetFat[1]}%
          </b>
        </div>
        <div className="goal-line">
          <span>体重</span>
          <b>
            {p.weight} → 约 {a.targetWeight} kg <small className={diff > 0 ? 'up' : ''}>({diff > 0 ? '+' : ''}{diff})</small>
          </b>
        </div>
        <div className="goal-line">
          <span>重点部位</span>
          <b>{p.targets.map((t) => TARGET_INFO[t].label).join('、')}</b>
        </div>
      </section>

      <section className="card">
        <h3>
          每周节奏 <small>{p.days} 练 · 每次 {p.minutes} 分钟</small>
        </h3>
        <div className="week-grid">
          {sched.map((k, i) => (
            <div key={i} className={`wg ${k === 'rest' ? 'rest' : ''}`}>
              <span>周{WD[i]}</span>
              <b>{k === 'rest' ? '休' : DAY_INFO[k].title.slice(0, 2)}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>
          每日饮食 <small>日均约 {a.kcal} kcal · 蛋白质 {a.protein} g</small>
        </h3>
        <p className="note">不用称重，用手估算每餐的量：</p>
        <div className="palm-row">
          <Palm n={palm.protein} unit="掌心" label="蛋白质" color="var(--c-protein)" />
          <Palm n={palm.carbs} unit="拳头" label="主食" color="var(--c-carb)" />
          <Palm n={palm.veg} unit="拳头" label="蔬菜" color="var(--c-veg)" />
          <Palm n={palm.fat} unit="拇指" label="油脂" color="var(--c-fat)" />
        </div>
      </section>

      <section className="card">
        <h3>三个阶段</h3>
        <ol className="phases">
          {PHASES.map((ph, i) => (
            <li key={ph.name}>
              <b>{ph.name}</b>
              <span>{ph.desc}</span>
              {i === 0 && <em>第 1–2 周</em>}
            </li>
          ))}
        </ol>
      </section>

      <p className="disclaimer">体脂为根据身高体重估算，仅供参考。如有伤病或慢性病，请先咨询医生。</p>

      <div className="bottom-bar sticky">
        <button className="btn primary block" onClick={onStart}>
          开始我的薄肌计划
        </button>
        <button className="link center" onClick={onRedo}>
          重新测评
        </button>
      </div>
    </div>
  )
}

function Palm({ n, unit, label, color }: { n: number; unit: string; label: string; color: string }) {
  return (
    <div className="palm">
      <div className="palm-dot" style={{ background: color }}>
        {n}
      </div>
      <b>{label}</b>
      <span>{unit}/餐</span>
    </div>
  )
}
