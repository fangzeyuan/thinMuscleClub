import { useState } from 'react'
import { BODY_TYPE_INFO } from '../lib/plan'
import type { Energy } from '../lib/energy'

interface Props {
  e: Energy
  balance: { days: number; avg: number; kgPerWeek: number } | null
  onAddMeal: () => void
  onAsk: (text: string) => void
}

/** 首页主视图：热量预算、已摄入、运动消耗、剩余 */
export default function EnergyCard({ e, balance, onAddMeal, onAsk }: Props) {
  const [open, setOpen] = useState(false)
  const over = e.remaining < 0
  const ratio = Math.min(1, e.intake / e.budget)

  // 半圆仪表
  const R = 78
  const C = Math.PI * R
  return (
    <section className="card energy-card">
      <div className="ec-head">
        <h3>今日热量</h3>
        <button className="link" onClick={() => setOpen(!open)}>
          {open ? '收起' : '怎么算的？'}
        </button>
      </div>

      <div className="ec-main">
        <div className="ec-side">
          <span>已摄入</span>
          <b>{e.intake}</b>
          <button className="ec-add" onClick={onAddMeal}>
            + 记一餐
          </button>
        </div>

        <div className="ec-gauge">
          <svg viewBox="0 0 180 100" width="180" height="100">
            <path d={`M12,92 A${R},${R} 0 0 1 168,92`} fill="none" stroke="var(--line)" strokeWidth="12" strokeLinecap="round" />
            {e.intake > 0 && (
              <path
                d={`M12,92 A${R},${R} 0 0 1 168,92`}
                fill="none"
                stroke={over ? 'var(--warn)' : 'var(--accent)'}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${C * ratio} ${C}`}
                style={{ transition: 'stroke-dasharray .6s ease' }}
              />
            )}
          </svg>
          <div className="ec-center">
            <span>{over ? '超出' : '还可以吃'}</span>
            <b className={over ? 'over' : ''}>{Math.abs(e.remaining)}</b>
            <em>预算 {e.budget} 千卡</em>
          </div>
        </div>

        <div className="ec-side right">
          <span>运动消耗</span>
          <b>{e.exercise}</b>
          <em>已计入预算</em>
        </div>
      </div>

      {over && <p className="note calm">偶尔超一点没关系，身体看的是一周的平均。明天按计划吃就好，不用刻意少吃补回来。</p>}

      {e.unknownMeals > 0 && (
        <button className="ec-unknown" onClick={() => onAsk('帮我估算一下今天没填热量的那几餐，重新记录一下')}>
          有 {e.unknownMeals} 餐没有填热量，没算进已摄入。让小薄帮你估算 →
        </button>
      )}

      {open && (
        <div className="ec-breakdown">
          <div>
            <span>基础代谢</span>
            <b>{e.bmr}</b>
          </div>
          <p>躺着不动也要消耗的热量，按体重 {e.weight}kg 计算</p>
          <div>
            <span>+ 日常活动</span>
            <b>{e.daily}</b>
          </div>
          <p>通勤、走动、做家务，按基础代谢的 30% 估算</p>
          <div>
            <span>+ 运动消耗</span>
            <b>{e.exercise}</b>
          </div>
          <p>来自今天的训练记录，练得越多预算越多</p>
          <div className="sum">
            <span>= 今日消耗</span>
            <b>{e.burn}</b>
          </div>
          <div>
            <span>{e.adjust < 0 ? '− 目标缺口' : '+ 目标盈余'}</span>
            <b>{Math.abs(e.adjust)}</b>
          </div>
          <p>
            {BODY_TYPE_INFO[e.type].name}：{e.adjust < 0 ? '小幅缺口，减脂同时保住肌肉' : '小幅盈余，帮助长肌肉'}
          </p>
          <div className="sum">
            <span>= 今日预算</span>
            <b>{e.budget}</b>
          </div>
          {e.floored && <p>预算已提到保底值：不低于基础代谢，吃太少会掉肌肉、更难瘦</p>}
        </div>
      )}

      {balance && (
        <div className="ec-balance">
          近 {balance.days} 天平均每天{balance.avg <= 0 ? '缺口' : '盈余'} <b>{Math.abs(balance.avg)}</b> 千卡
          <span>
            ≈ 每周{balance.avg <= 0 ? '减少' : '增加'} {Math.abs(balance.kgPerWeek)} kg 脂肪
          </span>
        </div>
      )}
    </section>
  )
}
