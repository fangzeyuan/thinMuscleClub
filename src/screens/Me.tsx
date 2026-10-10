import { useState } from 'react'
import { TARGET_INFO, type Profile } from '../lib/plan'
import type { WorkoutLog } from '../lib/store'

interface Props {
  profile: Profile
  logs: WorkoutLog[]
  intensity: number
  onRedo: () => void
  onReset: () => void
}

const FB = { easy: '太轻松', ok: '刚刚好', hard: '有点累' }

export default function Me({ profile: p, logs, intensity, onRedo, onReset }: Props) {
  const [confirming, setConfirming] = useState(false)
  const recent = [...logs].reverse().slice(0, 10)

  return (
    <div className="screen scroll me">
      <header className="page-head">
        <div>
          <p className="eyebrow">我的</p>
          <h1>薄肌练习生</h1>
        </div>
      </header>

      <section className="card">
        <h3>个人资料</h3>
        <div className="kv">
          <span>性别 / 年龄</span>
          <b>
            {p.sex === 'male' ? '男' : '女'} · {p.age} 岁
          </b>
        </div>
        <div className="kv">
          <span>身高 / 体重</span>
          <b>
            {p.height} cm · {p.weight} kg
          </b>
        </div>
        <div className="kv">
          <span>腰围</span>
          <b>{p.waist ? `${p.waist} cm` : '未填写'}</b>
        </div>
        <div className="kv">
          <span>目标部位</span>
          <b>{p.targets.map((t) => TARGET_INFO[t].label).join('、')}</b>
        </div>
        <div className="kv">
          <span>训练强度</span>
          <b>{Math.round(intensity * 100)}%</b>
        </div>
        <button className="btn ghost block" onClick={onRedo}>
          更新数据并重新测评
        </button>
      </section>

      <section className="card">
        <h3>训练记录</h3>
        {recent.length === 0 ? (
          <p className="muted">还没有记录，去完成第一次训练吧。</p>
        ) : (
          <ul className="history">
            {recent.map((l, i) => (
              <li key={i}>
                <div>
                  <b>{l.title}</b>
                  <span>
                    {l.date.slice(5)} · {Math.round(l.durationSec / 60)} 分钟 · {l.kcal} 千卡
                  </span>
                </div>
                {l.feedback && <em>{FB[l.feedback]}</em>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        {confirming ? (
          <div className="confirm">
            <p>将清除所有测评和训练记录，确定吗？</p>
            <div className="row">
              <button className="btn ghost" onClick={() => setConfirming(false)}>
                取消
              </button>
              <button className="btn danger" onClick={onReset}>
                清除
              </button>
            </div>
          </div>
        ) : (
          <button className="link danger-text" onClick={() => setConfirming(true)}>
            清除所有数据
          </button>
        )}
      </section>
    </div>
  )
}
