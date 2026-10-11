import type { FacilityKind } from '@tmc/core/data/activities'
import { KIND_STYLE, poly, project, shade, tileCorners, type Pt } from './iso'

interface BuildingProps {
  kind: FacilityKind
  x: number
  y: number
  level: number
  trainedToday: boolean
  active: boolean
  dim?: boolean
  onClick?: () => void
}

/** 设施：盒子建筑或平地设施（泳池、跑道、公园）。等级越高建筑越高。 */
export function Building({ kind, x, y, level, trainedToday, active, dim, onClick }: BuildingProps) {
  const st = KIND_STYLE[kind]
  const c = project(x + 0.5, y + 0.5)
  let body: JSX.Element
  let top: Pt

  if (st.flat) {
    const base = tileCorners(x, y, 0.06)
    top = { x: c.x, y: c.y - 14 }
    if (kind === 'pool') {
      body = (
        <>
          <polygon points={poly(base)} fill="#d9eef8" />
          <polygon points={poly(tileCorners(x, y, 0.18))} fill={st.roof} />
          <path d={`M${c.x - 14},${c.y - 2} q4,-3 8,0 t8,0 t8,0`} stroke="#fff" strokeWidth="1.5" fill="none" opacity=".8" />
          <path d={`M${c.x - 10},${c.y + 4} q4,-3 8,0 t8,0`} stroke="#fff" strokeWidth="1.5" fill="none" opacity=".6" />
        </>
      )
    } else if (kind === 'track') {
      body = (
        <>
          <polygon points={poly(base)} fill={st.roof} />
          <polygon points={poly(tileCorners(x, y, 0.22))} fill="#7fd3a0" />
          <polygon points={poly(tileCorners(x, y, 0.13))} fill="none" stroke="#fff" strokeWidth="1" strokeDasharray="3 3" />
        </>
      )
    } else {
      const tree = (dx: number, dy: number, s: number) => {
        const p = project(x + dx, y + dy)
        return (
          <g key={`${dx}${dy}`}>
            <rect x={p.x - 1.5} y={p.y - 10 * s} width="3" height={10 * s} fill="#9a6b4a" />
            <circle cx={p.x} cy={p.y - 13 * s} r={7 * s} fill="#3fb877" />
            <circle cx={p.x - 2} cy={p.y - 15 * s} r={3 * s} fill="#6fd69c" />
          </g>
        )
      }
      body = (
        <>
          <polygon points={poly(base)} fill={st.roof} />
          {[tree(0.3, 0.3, 1), tree(0.75, 0.35, 0.8), tree(0.35, 0.75, 0.9)]}
        </>
      )
    }
  } else {
    const h = 26 + level * 7
    const [t, r, b, l] = tileCorners(x, y, 0.14)
    const up = (p: Pt) => ({ x: p.x, y: p.y - h })
    top = { x: c.x, y: c.y - h - 10 }
    const door = { x: (l.x + b.x) / 2, y: (l.y + b.y) / 2 }
    body = (
      <>
        <polygon points={poly([l, b, up(b), up(l)])} fill={shade(st.roof, 0.72)} />
        <polygon points={poly([b, r, up(r), up(b)])} fill={shade(st.roof, 0.88)} />
        <polygon points={poly([up(t), up(r), up(b), up(l)])} fill={st.roof} />
        {/* 窗户 */}
        {Array.from({ length: Math.min(level, 4) }, (_, i) => {
          const wy = -h + 10 + i * 8
          return <polygon key={i} points={poly([{ x: b.x + 5, y: b.y + wy + 1 }, { x: b.x + 14, y: b.y + wy - 3.5 }, { x: b.x + 14, y: b.y + wy + 1.5 }, { x: b.x + 5, y: b.y + wy + 6 }])} fill={st.wall} opacity=".9" />
        })}
        {/* 门 */}
        <polygon points={poly([{ x: door.x - 4, y: door.y - 2 }, { x: door.x + 4, y: door.y + 2 }, { x: door.x + 4, y: door.y - 11 }, { x: door.x - 4, y: door.y - 15 }])} fill={active ? '#ffe28a' : shade(st.roof, 0.45)} />
      </>
    )
  }

  return (
    <g className={`building ${dim ? 'dim' : ''} ${active ? 'active' : ''}`} onClick={onClick}>
      <ellipse cx={c.x} cy={c.y + 4} rx="26" ry="10" fill="rgba(20,30,40,.08)" />
      {body}
      <text x={top.x} y={top.y} textAnchor="middle" fontSize="15" className="b-emoji">
        {st.emoji}
      </text>
      {level > 1 && (
        <g transform={`translate(${top.x + 12},${top.y - 12})`}>
          <rect x="-1" y="-8" width="22" height="12" rx="6" fill="#16191f" />
          <text x="10" y="1" textAnchor="middle" fontSize="8" fill="#fff" fontWeight="700">
            Lv{level}
          </text>
        </g>
      )}
      {trainedToday && (
        <g transform={`translate(${top.x - 16},${top.y - 10})`}>
          <circle r="6" fill="#13b885" />
          <path d="M-2.5,0 l1.8,1.8 l3.2,-3.6" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </g>
      )}
    </g>
  )
}

export type AvatarPose = 'idle' | 'walk' | 'strength' | 'cardio' | 'flex' | 'swim'

/** 角色：体型阶段 0–4 决定肩宽、腰线、手臂粗细和腹部线条 */
export function Avatar({ at, stage, pose, facingLeft }: { at: Pt; stage: number; pose: AvatarPose; facingLeft: boolean }) {
  const p = project(at.x, at.y)
  const sh = 7 + stage * 0.9 // 半肩宽
  const wa = 5.6 - stage * 0.25 // 半腰宽
  const arm = 2.2 + stage * 0.35
  return (
    <g transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`} className={`avatar pose-${pose}`}>
      <ellipse cx="0" cy="0" rx="9" ry="3.5" fill="rgba(20,30,40,.18)" />
      <g transform={facingLeft ? 'scale(-1,1)' : undefined}>
        <g className="av-body">
          {/* 腿 */}
          <line className="av-leg l" x1="-2.5" y1="-12" x2="-3" y2="0" stroke="#2b3240" strokeWidth="3" strokeLinecap="round" />
          <line className="av-leg r" x1="2.5" y1="-12" x2="3" y2="0" stroke="#2b3240" strokeWidth="3" strokeLinecap="round" />
          {/* 手臂 */}
          <line className="av-arm l" x1={-sh + 1} y1="-25" x2={-sh - 1} y2="-15" stroke="#f2c29e" strokeWidth={arm} strokeLinecap="round" />
          <line className="av-arm r" x1={sh - 1} y1="-25" x2={sh + 1} y2="-15" stroke="#f2c29e" strokeWidth={arm} strokeLinecap="round" />
          {/* 躯干：肩宽腰窄 */}
          <path d={`M${-sh},-26 L${sh},-26 L${wa},-12 L${-wa},-12 Z`} fill="#13b885" stroke={stage >= 4 ? '#0b8a63' : 'none'} strokeWidth="1" strokeLinejoin="round" />
          {stage >= 2 && <line x1="0" y1="-22" x2="0" y2="-14" stroke="#0b8a63" strokeWidth=".8" opacity=".7" />}
          {stage >= 3 && (
            <>
              <line x1="-2.5" y1="-19" x2="2.5" y2="-19" stroke="#0b8a63" strokeWidth=".8" opacity=".7" />
              <line x1="-2.2" y1="-16" x2="2.2" y2="-16" stroke="#0b8a63" strokeWidth=".8" opacity=".7" />
            </>
          )}
          {/* 头 */}
          <circle cx="0" cy="-31" r="5.2" fill="#f2c29e" />
          <path d="M-5.2,-32 a5.2,5.2 0 0 1 10.4,0 q-5,-2.5 -10.4,0" fill="#2b3240" />
        </g>
      </g>
    </g>
  )
}
