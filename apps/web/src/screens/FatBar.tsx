import type { Sex } from '@tmc/core/plan'

/** 体脂刻度条：标出薄肌区间和当前位置 */
export default function FatBar({ sex, value, range }: { sex: Sex; value: number; range: [number, number] }) {
  const [lo, hi] = sex === 'male' ? [5, 35] : [12, 42]
  const pct = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`
  return (
    <div className="fatbar">
      <div className="fatbar-track">
        <div className="fatbar-zone" style={{ left: pct(range[0]), width: `calc(${pct(range[1])} - ${pct(range[0])})` }}>
          <span>薄肌区间</span>
        </div>
        <div className="fatbar-pin" style={{ left: pct(value) }}>
          <span>你</span>
        </div>
      </div>
      <div className="fatbar-scale">
        <span>{lo}%</span>
        <span>{hi}%</span>
      </div>
    </div>
  )
}
