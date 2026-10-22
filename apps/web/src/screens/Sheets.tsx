import { ACTIVITIES } from '@tmc/core/data/activities'
import type { Rpe } from '@tmc/core/training'
import { useState, type ReactNode } from 'react'
import { SLOT_LABEL, uid, type Meal, type Slot, type Sleep } from '../lib/store'

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function SleepSheet({ value, onSave, onClose }: { value?: Sleep; onSave: (s: Sleep | undefined) => void; onClose: () => void }) {
  const [bed, setBed] = useState(value?.bed ?? '23:30')
  const [wake, setWake] = useState(value?.wake ?? '07:30')
  const [q, setQ] = useState<Sleep['quality']>(value?.quality)
  return (
    <Sheet title="昨晚睡得怎么样" onClose={onClose}>
      <div className="time-row">
        <label>
          <span>入睡</span>
          <input type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
        </label>
        <label>
          <span>起床</span>
          <input type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
        </label>
      </div>
      <div className="field-label">睡眠质量</div>
      <div className="seg">
        {(
          [
            ['good', '很好'],
            ['ok', '一般'],
            ['poor', '不好'],
          ] as const
        ).map(([k, t]) => (
          <button key={k} className={q === k ? 'on' : ''} onClick={() => setQ(q === k ? undefined : k)}>
            {t}
          </button>
        ))}
      </div>
      <button className="btn primary block" onClick={() => onSave({ bed, wake, quality: q, source: 'app' })}>
        保存
      </button>
      {value && (
        <button className="link center" onClick={() => onSave(undefined)}>
          清除记录
        </button>
      )}
    </Sheet>
  )
}

const defaultSlot = (): Slot => {
  const h = new Date().getHours()
  return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack'
}

export function MealSheet({ onSave, onClose }: { onSave: (m: Meal) => void; onClose: () => void }) {
  const [slot, setSlot] = useState<Slot>(defaultSlot)
  const [text, setText] = useState('')
  const [palms, setPalms] = useState(1)
  const [kcal, setKcal] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  return (
    <Sheet title="记一餐" onClose={onClose}>
      <div className="chips">
        {(Object.keys(SLOT_LABEL) as Slot[]).map((s) => (
          <button key={s} className={`chip-btn ${slot === s ? 'on' : ''}`} onClick={() => setSlot(s)}>
            {SLOT_LABEL[s]}
          </button>
        ))}
      </div>
      <input className="text-input" placeholder="吃了什么？如：鸡胸肉沙拉 + 一个鸡蛋" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <div className="field-label">
        蛋白质大约几个掌心？<small>肉、蛋、鱼、豆腐，一掌心约 25g</small>
      </div>
      <div className="seg four">
        {[0, 0.5, 1, 2].map((n) => (
          <button key={n} className={palms === n ? 'on' : ''} onClick={() => setPalms(n)}>
            {n === 0 ? '几乎没有' : n === 0.5 ? '半掌' : `${n} 掌`}
          </button>
        ))}
      </div>
      <div className="field-label">
        热量大约多少？<small>一份正餐通常 400–700 千卡</small>
      </div>
      <div className="chips">
        {[200, 400, 600, 800].map((n) => (
          <button key={n} className={`chip-btn ${kcal === n && !custom ? 'on' : ''}`} onClick={() => { setKcal(n); setCustom('') }}>
            约 {n}
          </button>
        ))}
        <input
          className="chip-input"
          type="number"
          inputMode="numeric"
          placeholder="自己填"
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value)
            setKcal(e.target.value ? Number(e.target.value) : null)
          }}
        />
      </div>
      <button
        className="btn primary block top12"
        disabled={!text.trim()}
        onClick={() => onSave({ id: uid(), slot, text: text.trim(), protein: Math.round(palms * 25), kcal: kcal && kcal > 0 ? Math.round(kcal) : undefined, source: 'app' })}
      >
        保存
      </button>
      <p className="fine">想更省事？直接在「教练」里说"中午吃了一碗牛肉面"，会自动估算并记录</p>
    </Sheet>
  )
}

export function BodySheet({
  weight,
  waist,
  onSave,
  onClose,
}: {
  weight?: number
  waist?: number
  onSave: (w: number | undefined, waist: number | undefined) => void
  onClose: () => void
}) {
  const [w, setW] = useState(weight?.toString() ?? '')
  const [wa, setWa] = useState(waist?.toString() ?? '')
  const parse = (v: string) => (v.trim() && !isNaN(Number(v)) ? Number(v) : undefined)
  return (
    <Sheet title="身体数据" onClose={onClose}>
      <div className="time-row">
        <label>
          <span>体重 kg</span>
          <input type="number" inputMode="decimal" step="0.1" placeholder="如 62.5" value={w} onChange={(e) => setW(e.target.value)} />
        </label>
        <label>
          <span>腰围 cm（可选）</span>
          <input type="number" inputMode="decimal" placeholder="如 72" value={wa} onChange={(e) => setWa(e.target.value)} />
        </label>
      </div>
      <p className="note calm">体重每天波动 ±1kg 很正常（喝水、盐分、经期都会影响）。建议每天早上空腹称，只看 7 日平均。</p>
      <button className="btn primary block" onClick={() => onSave(parse(w), parse(wa))}>
        保存
      </button>
    </Sheet>
  )
}

/** 补录训练：忘了在小镇计时、或者补记过去某天的训练 */
export function WorkoutSheet({ dateText, onSave, onClose }: { dateText: string; onSave: (w: { activityId: string; minutes: number; rpe?: Rpe }) => void; onClose: () => void }) {
  const [activityId, setActivityId] = useState('gym_strength')
  const [minutes, setMinutes] = useState('45')
  const [rpe, setRpe] = useState<Rpe | undefined>()
  const n = Number(minutes)
  const valid = Number.isFinite(n) && n >= 1 && n <= 600
  return (
    <Sheet title={`补录训练 · ${dateText}`} onClose={onClose}>
      <div className="field-label">项目</div>
      <div className="chips">
        {ACTIVITIES.filter((a) => a.id !== 'guided').map((a) => (
          <button key={a.id} className={`chip-btn ${activityId === a.id ? 'on' : ''}`} onClick={() => setActivityId(a.id)}>
            {a.name}
          </button>
        ))}
      </div>
      <div className="field-label">时长（分钟）</div>
      <div className="chips">
        {[20, 30, 45, 60, 90].map((m) => (
          <button key={m} className={`chip-btn ${minutes === String(m) ? 'on' : ''}`} onClick={() => setMinutes(String(m))}>
            {m}
          </button>
        ))}
        <input className="chip-input" type="number" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </div>
      <div className="field-label">感觉如何（可选）</div>
      <div className="seg">
        {(
          [
            ['easy', '轻松'],
            ['ok', '刚好'],
            ['hard', '有点累'],
          ] as const
        ).map(([k, t]) => (
          <button key={k} className={rpe === k ? 'on' : ''} onClick={() => setRpe(rpe === k ? undefined : k)}>
            {t}
          </button>
        ))}
      </div>
      <button className="btn primary block" disabled={!valid} onClick={() => onSave({ activityId, minutes: Math.round(n), rpe })}>
        保存
      </button>
    </Sheet>
  )
}
