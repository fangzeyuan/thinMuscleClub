import { addDays, dateAt } from '@tmc/core/day'
import { dateKey } from '@tmc/core/plan'
import { dayScore } from '@tmc/core/pillars'
import { getDay, type AppState } from '../lib/store'

interface Props {
  state: AppState
  /** 显示的月份：YYYY-MM */
  month: string
  today: string
  selected?: string
  /** 可选的最早日期（开始计划那天） */
  min: string
  onSelect: (date: string) => void
  onMonth: (month: string) => void
}

const WEEK = ['一', '二', '三', '四', '五', '六', '日']

export const monthOf = (date: string) => date.slice(0, 7)
export const shiftMonth = (month: string, n: number) => {
  const d = dateAt(`${month}-01`)
  d.setMonth(d.getMonth() + n)
  return dateKey(d).slice(0, 7)
}

/** 过程分 → 颜色深浅（0 = 没有记录） */
const level = (score: number) => (score >= 75 ? 3 : score >= 50 ? 2 : score > 0 ? 1 : 0)

export default function MonthCalendar({ state, month, today, selected, min, onSelect, onMonth }: Props) {
  const p = state.profile!
  const first = `${month}-01`
  const lead = (dateAt(first).getDay() + 6) % 7 // 周一开头
  const daysInMonth = new Date(dateAt(first).getFullYear(), dateAt(first).getMonth() + 1, 0).getDate()
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i))]
  while (cells.length % 7) cells.push(null)

  const [y, m] = month.split('-').map(Number)
  const canPrev = monthOf(min) < month
  const canNext = month < monthOf(today)

  return (
    <div className="month-cal">
      <div className="mc-head">
        <button className="icon-btn" disabled={!canPrev} onClick={() => onMonth(shiftMonth(month, -1))} aria-label="上个月">
          ‹
        </button>
        <b>
          {y}年{m}月
        </b>
        <button className="icon-btn" disabled={!canNext} onClick={() => onMonth(shiftMonth(month, 1))} aria-label="下个月">
          ›
        </button>
      </div>
      <div className="mc-grid">
        {WEEK.map((w) => (
          <span key={w} className="mc-wd">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />
          const disabled = d > today || d < min
          const day = getDay(state, d)
          // 一条记录都没有的日子显示为空白（休息日按计划休息虽然算"练"完成，但回顾时会误以为那天记录过）
          const recorded = day.sessions.length > 0 || day.meals.length > 0 || day.water > 0 || !!day.sleep || day.weight != null
          const lv = disabled || !recorded ? 0 : level(dayScore(p, day, d))
          return (
            <button
              key={d}
              className={`mc-day l${lv} ${d === today ? 'today' : ''} ${d === selected ? 'sel' : ''}`}
              disabled={disabled}
              onClick={() => onSelect(d)}
              aria-label={d}
            >
              {Number(d.slice(8))}
              {day.sessions.length > 0 && !disabled && <i />}
            </button>
          )
        })}
      </div>
      <div className="mc-legend">
        <span>过程分</span>
        <i className="l0" />
        <i className="l1" />
        <i className="l2" />
        <i className="l3" />
        <span>高</span>
        <span className="dot-key">
          <i /> 有训练
        </span>
      </div>
    </div>
  )
}
