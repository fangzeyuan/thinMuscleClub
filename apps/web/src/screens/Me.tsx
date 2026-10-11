import { useEffect, useState } from 'react'
import { checkAiConfig } from '../lib/ai'
import { BODY_TYPE_INFO, TARGET_INFO, type PlanCtx } from '@tmc/core/plan'
import { targets } from '@tmc/core/pillars'
import type { AppState } from '../lib/store'

interface Props {
  ctx: PlanCtx
  state: AppState
  onRedo: () => void
  onReset: () => void
}

export default function Me({ ctx, state, onRedo, onReset }: Props) {
  const { p, a } = ctx
  const t = targets(p)
  const [confirming, setConfirming] = useState(false)
  const [cfg, setCfg] = useState<{ configured: boolean; model?: string; provider?: string } | null>(null)
  useEffect(() => {
    checkAiConfig().then(setCfg)
  }, [])

  const summaries = Object.entries(state.days)
    .filter(([, d]) => d.summary)
    .sort((x, y) => y[0].localeCompare(x[0]))
    .slice(0, 7)

  return (
    <div className="screen scroll me">
      <header className="page-head">
        <div>
          <p className="eyebrow">我的</p>
          <h1>{BODY_TYPE_INFO[a.type].name}</h1>
        </div>
      </header>

      <section className="card">
        <h3>每日目标</h3>
        <div className="kv">
          <span>睡眠</span>
          <b>{t.sleepH} 小时</b>
        </div>
        <div className="kv">
          <span>训练</span>
          <b>
            每周 {p.days} 次 · 每次 {p.minutes} 分钟
          </b>
        </div>
        <div className="kv">
          <span>蛋白质 / 热量</span>
          <b>
            {t.protein} g · 日均约 {t.kcal} kcal
          </b>
        </div>
        <div className="kv">
          <span>饮水</span>
          <b>{t.water} ml</b>
        </div>
      </section>

      <section className="card">
        <h3>个人资料</h3>
        <div className="kv">
          <span>性别 / 年龄</span>
          <b>
            {p.sex === 'male' ? '男' : '女'} · {p.age} 岁
          </b>
        </div>
        <div className="kv">
          <span>身高 / 测评体重</span>
          <b>
            {p.height} cm · {p.weight} kg
          </b>
        </div>
        <div className="kv">
          <span>目标部位</span>
          <b>{p.targets.map((x) => TARGET_INFO[x].label).join('、')}</b>
        </div>
        <div className="kv">
          <span>训练强度</span>
          <b>{Math.round(state.intensity * 100)}%</b>
        </div>
        <button className="btn ghost block" onClick={onRedo}>
          更新数据并重新测评
        </button>
      </section>

      {summaries.length > 0 && (
        <section className="card">
          <h3>小薄的每日总结</h3>
          <ul className="history">
            {summaries.map(([date, d]) => (
              <li key={date} className="summary-item">
                <span>{date.slice(5)}</span>
                <p>{d.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h3>AI 教练</h3>
        <div className="kv">
          <span>模型</span>
          <b>{cfg == null ? '检测中…' : cfg.configured ? `${cfg.provider} · ${cfg.model}` : '未配置'}</b>
        </div>
        <p className="note">API Key 只保存在服务端 .env 中，不会发送到浏览器。聊天时会把你的档案和近 7 天记录发送给所选的模型服务商。</p>
      </section>

      <section className="card">
        {confirming ? (
          <div className="confirm">
            <p>将清除所有测评、记录和聊天，确定吗？</p>
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
