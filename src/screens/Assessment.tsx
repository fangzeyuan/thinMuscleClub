import { useState } from 'react'
import type { Equip } from '../data/exercises'
import { TARGET_INFO, type Exp, type Profile, type Shape, type Target } from '../lib/plan'

interface Props {
  initial?: Profile
  onBack: () => void
  onDone: (p: Profile) => void
}

const DEFAULT: Profile = {
  sex: 'female',
  age: 25,
  height: 163,
  weight: 54,
  waist: null,
  shape: 'even',
  targets: [],
  exp: 1,
  equip: ['none'],
  days: 4,
  minutes: 20,
}

const SHAPES: { k: Shape; t: string; d: string }[] = [
  { k: 'skinny', t: '偏瘦，没什么肉', d: '穿衣显单薄，想要有型一点' },
  { k: 'even', t: '匀称，但没线条', d: '不胖，但肚子和手臂软软的' },
  { k: 'soft', t: '有点小肚子', d: '体重正常，腰腹和大腿有肉' },
  { k: 'heavy', t: '整体偏胖', d: '想先瘦下来，再练线条' },
]

const EXPS: { k: Exp; t: string; d: string }[] = [
  { k: 1, t: '零基础', d: '几乎不运动，或很久没练了' },
  { k: 2, t: '偶尔练', d: '能做几个标准俯卧撑 / 深蹲' },
  { k: 3, t: '规律训练', d: '每周练 3 次以上，坚持了几个月' },
]

const EQUIPS: { k: Equip; t: string; d: string }[] = [
  { k: 'none', t: '徒手', d: '一块瑜伽垫就够' },
  { k: 'band', t: '弹力带', d: '几十块钱，练肩背臀很好用' },
  { k: 'dumbbell', t: '哑铃', d: '可调节哑铃或一对轻哑铃' },
]

const STEPS = ['sex', 'age', 'height', 'weight', 'waist', 'shape', 'targets', 'exp', 'equip', 'time'] as const

export default function Assessment({ initial, onBack, onDone }: Props) {
  const [p, setP] = useState<Profile>(initial ?? DEFAULT)
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }))

  const canNext = step !== 'targets' || p.targets.length > 0
  const next = () => (i === STEPS.length - 1 ? onDone(p) : setI(i + 1))
  const prev = () => (i === 0 ? onBack() : setI(i - 1))

  let title = ''
  let hint = ''
  let body: JSX.Element

  switch (step) {
    case 'sex':
      title = '你的性别'
      hint = '男女的薄肌体脂标准不同'
      body = (
        <div className="opt-grid two">
          {(
            [
              ['female', '女生', '♀'],
              ['male', '男生', '♂'],
            ] as const
          ).map(([k, t, g]) => (
            <button key={k} className={`opt big ${p.sex === k ? 'on' : ''}`} onClick={() => {
              setP((x) => ({ ...x, sex: k, ...(initial ? {} : k === 'male' ? { height: 175, weight: 68 } : { height: 163, weight: 54 }) }))
            }}>
              <span className="opt-glyph">{g}</span>
              <span className="opt-title">{t}</span>
            </button>
          ))}
        </div>
      )
      break
    case 'age':
      title = '你的年龄'
      hint = '用于估算基础代谢'
      body = <Ruler value={p.age} min={14} max={60} step={1} unit="岁" onChange={(v) => set('age', v)} />
      break
    case 'height':
      title = '你的身高'
      body = <Ruler value={p.height} min={140} max={200} step={1} unit="cm" onChange={(v) => set('height', v)} />
      break
    case 'weight':
      title = '你的体重'
      hint = '早上空腹的体重最准'
      body = <Ruler value={p.weight} min={35} max={130} step={0.5} unit="kg" onChange={(v) => set('weight', v)} />
      break
    case 'waist':
      title = '你的腰围'
      hint = '肚脐一圈，放松状态下测量。填了会更准，不知道可以跳过'
      body = (
        <>
          {p.waist === null ? (
            <div className="skip-box">
              <p>暂时不知道腰围</p>
              <button className="btn ghost" onClick={() => set('waist', p.sex === 'male' ? 78 : 66)}>
                我量过，填一下
              </button>
            </div>
          ) : (
            <>
              <Ruler value={p.waist} min={50} max={130} step={1} unit="cm" onChange={(v) => set('waist', v)} />
              <button className="link center" onClick={() => set('waist', null)}>
                不填了
              </button>
            </>
          )}
        </>
      )
      break
    case 'shape':
      title = '现在的你，更像哪种？'
      hint = '凭感觉选就好'
      body = (
        <div className="opt-list">
          {SHAPES.map((s) => (
            <button key={s.k} className={`opt row ${p.shape === s.k ? 'on' : ''}`} onClick={() => set('shape', s.k)}>
              <span className="opt-title">{s.t}</span>
              <span className="opt-desc">{s.d}</span>
            </button>
          ))}
        </div>
      )
      break
    case 'targets':
      title = '最想练出哪里？'
      hint = '最多选 3 个，计划会重点安排'
      body = (
        <div className="opt-grid two">
          {(Object.keys(TARGET_INFO) as Target[]).map((k) => {
            const on = p.targets.includes(k)
            const full = !on && p.targets.length >= 3
            return (
              <button
                key={k}
                className={`opt ${on ? 'on' : ''} ${full ? 'dim' : ''}`}
                onClick={() => !full && set('targets', on ? p.targets.filter((t) => t !== k) : [...p.targets, k])}
              >
                <span className="opt-title">{TARGET_INFO[k].label}</span>
                <span className="opt-desc">{TARGET_INFO[k].desc}</span>
                {on && <span className="check">✓</span>}
              </button>
            )
          })}
        </div>
      )
      break
    case 'exp':
      title = '你的运动经验'
      body = (
        <div className="opt-list">
          {EXPS.map((s) => (
            <button key={s.k} className={`opt row ${p.exp === s.k ? 'on' : ''}`} onClick={() => set('exp', s.k)}>
              <span className="opt-title">{s.t}</span>
              <span className="opt-desc">{s.d}</span>
            </button>
          ))}
        </div>
      )
      break
    case 'equip':
      title = '你手边有哪些器械？'
      hint = '可多选。没有器械也完全可以练'
      body = (
        <div className="opt-list">
          {EQUIPS.map((s) => {
            const on = p.equip.includes(s.k)
            const locked = s.k === 'none'
            return (
              <button
                key={s.k}
                className={`opt row ${on ? 'on' : ''}`}
                onClick={() => !locked && set('equip', on ? p.equip.filter((e) => e !== s.k) : [...p.equip, s.k])}
              >
                <span className="opt-title">
                  {s.t}
                  {locked && <small> · 默认包含</small>}
                </span>
                <span className="opt-desc">{s.d}</span>
                {on && <span className="check">✓</span>}
              </button>
            )
          })}
        </div>
      )
      break
    case 'time':
      title = '你能投入多少时间？'
      hint = '量力而行，坚持比强度更重要'
      body = (
        <>
          <div className="field-label">每周训练</div>
          <div className="seg">
            {([3, 4, 5] as const).map((d) => (
              <button key={d} className={p.days === d ? 'on' : ''} onClick={() => set('days', d)}>
                {d} 天
              </button>
            ))}
          </div>
          <div className="field-label">每次时长</div>
          <div className="seg">
            {([15, 20, 30] as const).map((m) => (
              <button key={m} className={p.minutes === m ? 'on' : ''} onClick={() => set('minutes', m)}>
                {m} 分钟
              </button>
            ))}
          </div>
        </>
      )
      break
  }

  return (
    <div className="screen assess">
      <header className="topbar">
        <button className="icon-btn" onClick={prev} aria-label="返回">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="progress">
          <div style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} />
        </div>
        <span className="step-count">
          {i + 1}/{STEPS.length}
        </span>
      </header>

      <div className="assess-body" key={step}>
        <h2>{title}</h2>
        {hint && <p className="hint">{hint}</p>}
        <div className="assess-content">{body}</div>
      </div>

      <div className="bottom-bar">
        <button className="btn primary block" disabled={!canNext} onClick={next}>
          {i === STEPS.length - 1 ? '生成我的计划' : step === 'waist' && p.waist === null ? '跳过' : '下一步'}
        </button>
      </div>
    </div>
  )
}

function Ruler(props: { value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  const { value, min, max, step, unit, onChange } = props
  const bump = (d: number) => onChange(Math.min(max, Math.max(min, Math.round((value + d) * 10) / 10)))
  return (
    <div className="ruler">
      <div className="ruler-value">
        <button className="round-btn" onClick={() => bump(-step)} aria-label="减少">
          −
        </button>
        <div>
          <b>{step < 1 ? value.toFixed(1) : value}</b>
          <span>{unit}</span>
        </div>
        <button className="round-btn" onClick={() => bump(step)} aria-label="增加">
          +
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--pct' as string]: `${((value - min) / (max - min)) * 100}%` }}
      />
      <div className="ruler-scale">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  )
}
