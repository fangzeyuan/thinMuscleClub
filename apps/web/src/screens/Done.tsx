import type { Workout } from '@tmc/core/plan'
import type { Rpe as Feedback } from '@tmc/core/training'

interface Props {
  workout: Workout
  run: { durationSec: number; kcal: number }
  streak: number
  totalDays: number
  onFeedback: (f: Feedback) => void
}

export default function Done({ workout, run, streak, totalDays, onFeedback }: Props) {
  const d = new Date()
  const mm = Math.floor(run.durationSec / 60)
  const ss = run.durationSec % 60

  return (
    <div className="screen done scroll">
      <div className="done-hero">
        <div className="done-check">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <h1>训练完成！</h1>
        <p className="muted">又离薄肌近了一步</p>
      </div>

      <div className="share-card">
        <div className="sc-top">
          <span className="brand">
            <span className="brand-mark" />
            薄肌俱乐部
          </span>
          <span>
            {d.getMonth() + 1}月{d.getDate()}日
          </span>
        </div>
        <p className="sc-title">{workout.title}</p>
        <div className="sc-stats">
          <div>
            <b>
              {mm}:{String(ss).padStart(2, '0')}
            </b>
            <span>时长</span>
          </div>
          <div>
            <b>{run.kcal}</b>
            <span>千卡</span>
          </div>
          <div>
            <b>{streak}</b>
            <span>连续天数</span>
          </div>
        </div>
        <p className="sc-foot">累计训练第 {totalDays} 天</p>
      </div>

      <section className="card">
        <h3>今天的强度感觉如何？</h3>
        <p className="note">会根据你的反馈调整下次训练量</p>
        <div className="fb-row">
          {(
            [
              ['easy', '太轻松', '下次加量'],
              ['ok', '刚刚好', '保持节奏'],
              ['hard', '有点累', '下次减量'],
            ] as const
          ).map(([k, t, d]) => (
            <button key={k} className="fb" onClick={() => onFeedback(k)}>
              <b>{t}</b>
              <span>{d}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
