import { useEffect, useMemo, useRef, useState } from 'react'
import { ACTIVITIES, FACILITIES, activitiesAt, activityById, type FacilityKind } from '@tmc/core/data/activities'
import { usesAppPlan, type Workout } from '@tmc/core/plan'
import { uid, type AppState } from '../lib/store'
import {
  STALE_MS,
  activeSession,
  attributes,
  avatarStage,
  completedSessions,
  facilityLevel,
  levelOf,
  sessionMinutes,
  sessionMs,
  totalXp,
  trainingOps,
  type Facility,
  type Rpe,
} from '@tmc/core/training'
import { Sheet } from '../screens/Sheets'
import { GRID, KIND_STYLE, VIEW_H, VIEW_W, depth, doorOf, poly, tileCorners } from './iso'
import { Avatar, Building, type AvatarPose } from './Sprites'
import { useWalker } from './useWalker'
import './game.css'

interface Props {
  state: AppState
  today: string
  workout: Workout
  apply: (op: (s: AppState) => AppState) => void
  onGuided: (w: Workout) => void
}

type Placing = { kind: FacilityKind; name?: string; moveId?: string }
type Result = { minutes: number; xp: number; level: number; levelUp: boolean; facilityName: string; fLevel: number; fMinutes: number; fNext: number | null }

const SCALE = 1.5
const fname = (f: Facility) => f.name || FACILITIES[f.kind].name
const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export default function Town({ state, today, workout, apply, onGuided }: Props) {
  const p = state.profile!
  const facilities = state.game.facilities
  const active = activeSession(state)
  const activeFacility = facilities.find((f) => f.id === active?.facilityId)
  const home = facilities.find((f) => f.kind === 'home') ?? facilities[0]

  const [sheet, setSheet] = useState<null | { type: 'build' } | { type: 'facility'; id: string }>(null)
  const [placing, setPlacing] = useState<Placing | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [now, setNow] = useState(Date.now())
  const [buildName, setBuildName] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [staleMin, setStaleMin] = useState(60)

  const walker = useWalker(doorOf((activeFacility ?? home)?.pos ?? { x: 3, y: 3 }))

  // 场景放大绘制，可拖动平移；初始居中
  const sceneRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sceneRef.current
    if (el) {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2
    }
  }, [])

  // 进行中的训练：每秒刷新计时（时长由时间戳计算，锁屏回来也准确）
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])

  const xp = totalXp(state)
  const lv = levelOf(xp)
  const attr = attributes(state)
  const stage = avatarStage(state, p.days)
  const trainedToday = new Set(completedSessions(state).filter((x) => x.date === today).map((x) => x.facilityId))
  const occupied = new Set(facilities.map((f) => `${f.pos.x},${f.pos.y}`))
  const placedKinds = new Set(facilities.map((f) => f.kind))

  const elapsed = active ? sessionMs(active, now) : 0
  const stale = active && elapsed > STALE_MS

  let pose: AvatarPose = walker.walking ? 'walk' : 'idle'
  if (active && !walker.walking) {
    const a = activityById(active.activityId)
    pose = active.pausedAt ? 'idle' : a.id === 'swim' ? 'swim' : a.category === 'strength' ? 'strength' : a.category === 'flexibility' ? 'flex' : 'cardio'
  }

  /* ---------- 操作 ---------- */

  const startAt = (f: Facility, activityId: string) => {
    setSheet(null)
    // 点下去就开始计时，走路只是动画（中途切走也不会丢记录）
    apply(trainingOps.start({ id: uid(), activityId, facilityId: f.id, source: 'game', date: today }))
    setNow(Date.now())
    walker.walkTo(doorOf(f.pos))
  }

  const finish = (rpe: Rpe | undefined, endAt?: number) => {
    if (!active) return
    const op = trainingOps.finish(active.id, { rpe, endAt, weightKg: p.weight })
    const next = op(state)
    const done = next.sessions.find((x) => x.id === active.id)!
    const before = levelOf(totalXp(state))
    const after = levelOf(totalXp(next))
    const f = activeFacility
    const fl = f ? facilityLevel(next, f.id) : null
    apply(op)
    setFinishing(false)
    setResult({
      minutes: sessionMinutes(done),
      xp: after.xp - before.xp,
      level: after.level,
      levelUp: after.level > before.level,
      facilityName: f ? fname(f) : '',
      fLevel: fl?.level ?? 0,
      fMinutes: fl?.minutes ?? 0,
      fNext: fl?.next ?? null,
    })
    if (home) walker.walkTo(doorOf(home.pos))
  }

  const place = (x: number, y: number) => {
    if (!placing || occupied.has(`${x},${y}`)) return
    if (placing.moveId) apply(trainingOps.moveFacility(placing.moveId, { x, y }))
    else apply(trainingOps.addFacility({ id: uid(), kind: placing.kind, name: placing.name, pos: { x, y }, createdAt: Date.now() }))
    setPlacing(null)
  }

  /* ---------- 场景 ---------- */

  const sorted = useMemo(
    () => [...facilities].sort((a, b) => depth(a.pos.x, a.pos.y) - depth(b.pos.x, b.pos.y)),
    [facilities],
  )
  const avatarDepth = depth(walker.pos.x, walker.pos.y)
  const drawables: { d: number; el: JSX.Element }[] = sorted.map((f) => ({
    d: depth(f.pos.x, f.pos.y) + 1,
    el: (
      <Building
        key={f.id}
        kind={f.kind}
        x={f.pos.x}
        y={f.pos.y}
        level={facilityLevel(state, f.id).level}
        trainedToday={trainedToday.has(f.id)}
        active={active?.facilityId === f.id}
        dim={!!placing && placing.moveId !== f.id}
        onClick={() => !placing && !walker.walking && setSheet({ type: 'facility', id: f.id })}
      />
    ),
  }))
  drawables.push({ d: avatarDepth, el: <Avatar key="me" at={walker.pos} stage={stage.stage} pose={pose} facingLeft={walker.facingLeft} /> })
  drawables.sort((a, b) => a.d - b.d)

  const sheetFacility = sheet?.type === 'facility' ? facilities.find((f) => f.id === sheet.id) : undefined

  return (
    <div className="screen town">
      {/* HUD */}
      <header className="town-hud">
        <div className="lv">
          <b>Lv{lv.level}</b>
          <div className="xp">
            <div style={{ width: `${lv.progress * 100}%` }} />
          </div>
          <span>
            {lv.xp - lv.cur}/{lv.next - lv.cur}
          </span>
        </div>
        <div className="attrs">
          <span>
            力量 <b>{attr.strength}</b>
          </span>
          <span>
            耐力 <b>{attr.endurance}</b>
          </span>
          <span>
            柔韧 <b>{attr.flexibility}</b>
          </span>
          <span className="stage">体型 {stage.stage}/4</span>
        </div>
      </header>

      {placing && (
        <div className="place-banner">
          点击空地放置「{placing.name || FACILITIES[placing.kind].name}」
          <button className="link" onClick={() => setPlacing(null)}>
            取消
          </button>
        </div>
      )}

      <div className="scene" ref={sceneRef}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width={VIEW_W * SCALE} height={VIEW_H * SCALE} className="scene-svg">
          {Array.from({ length: GRID * GRID }, (_, i) => {
            const x = i % GRID
            const y = Math.floor(i / GRID)
            const free = !occupied.has(`${x},${y}`)
            return (
              <polygon
                key={i}
                points={poly(tileCorners(x, y))}
                className={`tile ${(x + y) % 2 ? 'b' : 'a'} ${placing && free ? 'free' : ''}`}
                onClick={() => placing && free && place(x, y)}
              />
            )
          })}
          {drawables.map((d) => d.el)}
        </svg>
      </div>
      {!active && !placing && <p className="scene-hint">{facilities.length <= 1 ? '先把你常去的地方加进小镇吧' : '点击建筑，带上小薄去训练'}</p>}

      {/* 底部：训练中 / 建造按钮 */}
      {active ? (
        <div className="session-panel">
          {stale ? (
            <>
              <h3>这次训练已经持续 {Math.floor(elapsed / 3600000)} 小时了</h3>
              <p className="muted small">是不是忘了点结束？告诉我实际练了多久：</p>
              <div className="stale-row">
                <input type="number" inputMode="numeric" value={staleMin} onChange={(e) => setStaleMin(Number(e.target.value))} />
                <span>分钟</span>
                <button className="btn primary" onClick={() => finish(undefined, active.startAt + active.pausedMs + Math.max(1, staleMin) * 60000)}>
                  记录
                </button>
              </div>
              <button className="link center" onClick={() => apply(trainingOps.discard(active.id))}>
                放弃这次记录
              </button>
            </>
          ) : finishing ? (
            <>
              <h3>练得怎么样？</h3>
              <div className="fb-row">
                {(
                  [
                    ['easy', '轻松'],
                    ['ok', '刚好'],
                    ['hard', '有点累'],
                  ] as const
                ).map(([k, t]) => (
                  <button key={k} className="fb" onClick={() => finish(k)}>
                    <b>{t}</b>
                  </button>
                ))}
              </div>
              <div className="row-between">
                <button className="link" onClick={() => setFinishing(false)}>
                  继续练
                </button>
                <button className="link danger-text" onClick={() => {
                  apply(trainingOps.discard(active.id))
                  setFinishing(false)
                }}>
                  放弃这次
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="sp-head">
                <span className="sp-emoji">{activeFacility ? KIND_STYLE[activeFacility.kind].emoji : '💪'}</span>
                <div>
                  <b>{active.title || activityById(active.activityId).name}</b>
                  <span>{activeFacility ? fname(activeFacility) : ''}{active.pausedAt ? ' · 已暂停' : ' · 训练中'}</span>
                </div>
              </div>
              <div className={`sp-timer ${active.pausedAt ? 'paused' : ''}`}>{fmt(elapsed)}</div>
              <p className="muted small center-text">可以锁屏去练，回来再点结束，时间会照常计算</p>
              <div className="row-btns">
                <button className="btn ghost" onClick={() => apply(active.pausedAt ? trainingOps.resume(active.id) : trainingOps.pause(active.id))}>
                  {active.pausedAt ? '继续' : '暂停'}
                </button>
                <button className="btn primary" onClick={() => setFinishing(true)}>
                  结束训练
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        !placing && (
          <div className="town-actions">
            <button className="btn ghost" onClick={() => setSheet({ type: 'build' })} disabled={placedKinds.size >= Object.keys(FACILITIES).length}>
              + 添加场所
            </button>
          </div>
        )
      )}

      {/* 建造 */}
      {sheet?.type === 'build' && (
        <Sheet title="添加你常去的地方" onClose={() => setSheet(null)}>
          <p className="muted small">选你现实中会去的地方。之后去那里训练时，在小镇里带小薄过去就能计时。</p>
          <input className="text-input" placeholder="起个名字（可选），如：公司楼下健身房" value={buildName} onChange={(e) => setBuildName(e.target.value)} />
          <div className="build-grid">
            {(Object.keys(FACILITIES) as FacilityKind[])
              .filter((k) => !placedKinds.has(k))
              .map((k) => (
                <button
                  key={k}
                  className="build-card"
                  onClick={() => {
                    setPlacing({ kind: k, name: buildName.trim() || undefined })
                    setBuildName('')
                    setSheet(null)
                  }}
                >
                  <span className="be">{KIND_STYLE[k].emoji}</span>
                  <b>{FACILITIES[k].name}</b>
                  <span>{FACILITIES[k].desc}</span>
                </button>
              ))}
          </div>
        </Sheet>
      )}

      {/* 设施详情 */}
      {sheetFacility && (
        <Sheet title={`${KIND_STYLE[sheetFacility.kind].emoji} ${fname(sheetFacility)}`} onClose={() => { setSheet(null); setConfirmRemove(false) }}>
          <FacilityInfo state={state} f={sheetFacility} />
          {active ? (
            <p className="note calm">正在{activeFacility ? `「${fname(activeFacility)}」` : ''}训练中，结束后才能开始新的训练。</p>
          ) : (
            <>
              <div className="field-label">今天在这里练什么？</div>
              <div className="act-list">
                {sheetFacility.kind === 'home' && usesAppPlan(p) && (
                  <button className="act primary" onClick={() => { setSheet(null); onGuided(workout) }}>
                    <b>App 跟练</b>
                    <span>{workout.title} · {workout.estMin} 分钟</span>
                  </button>
                )}
                {activitiesAt(sheetFacility.kind)
                  .filter((a) => a.id !== 'guided')
                  .map((a) => (
                    <button key={a.id} className="act" onClick={() => startAt(sheetFacility, a.id)}>
                      <b>{a.name}</b>
                      <span>开始计时</span>
                    </button>
                  ))}
              </div>
            </>
          )}
          <div className="facility-tools">
            <button className="link" onClick={() => { setPlacing({ kind: sheetFacility.kind, moveId: sheetFacility.id }); setSheet(null) }}>
              移动位置
            </button>
            {sheetFacility.kind !== 'home' &&
              (confirmRemove ? (
                <span className="confirm-inline">
                  训练记录会保留，确定拆除？
                  <button className="link danger-text" onClick={() => { apply(trainingOps.removeFacility(sheetFacility.id)); setSheet(null); setConfirmRemove(false) }}>
                    拆除
                  </button>
                </span>
              ) : (
                <button className="link danger-text" onClick={() => setConfirmRemove(true)}>
                  拆除
                </button>
              ))}
          </div>
        </Sheet>
      )}

      {/* 结算 */}
      {result && (
        <div className="sheet-mask center" onClick={() => setResult(null)}>
          <div className="result-card" onClick={(e) => e.stopPropagation()}>
            {result.levelUp && <div className="levelup">升级！Lv{result.level}</div>}
            <h3>训练完成 · {result.minutes} 分钟</h3>
            {result.xp > 0 ? (
              <p className="xp-gain">+{result.xp} 经验</p>
            ) : (
              <p className="muted small">{result.minutes < 5 ? '少于 5 分钟不计经验，记录已保存' : '今天的经验已经满了，记录已保存。练得好也要休息好'}</p>
            )}
            {result.facilityName && (
              <div className="f-progress">
                <span>
                  {result.facilityName} Lv{result.fLevel}
                </span>
                {result.fNext != null ? (
                  <>
                    <div className="xp">
                      <div style={{ width: `${Math.min(100, (result.fMinutes / result.fNext) * 100)}%` }} />
                    </div>
                    <em>再练 {result.fNext - result.fMinutes} 分钟升级</em>
                  </>
                ) : (
                  <em>已满级</em>
                )}
              </div>
            )}
            <button className="btn primary block" onClick={() => setResult(null)}>
              好的
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function FacilityInfo({ state, f }: { state: AppState; f: Facility }) {
  const fl = facilityLevel(state, f.id)
  const recent = completedSessions(state)
    .filter((x) => x.facilityId === f.id)
    .slice(-3)
    .reverse()
  return (
    <div className="f-info">
      <div className="f-progress">
        <span>
          Lv{fl.level} · 累计 {fl.minutes} 分钟
        </span>
        {fl.next != null && (
          <>
            <div className="xp">
              <div style={{ width: `${Math.min(100, (fl.minutes / fl.next) * 100)}%` }} />
            </div>
            <em>再练 {fl.next - fl.minutes} 分钟升到 Lv{fl.level + 1}</em>
          </>
        )}
      </div>
      {recent.length > 0 && (
        <ul className="f-recent">
          {recent.map((x) => (
            <li key={x.id}>
              {x.date.slice(5)} · {x.title || ACTIVITIES.find((a) => a.id === x.activityId)?.name} · {sessionMinutes(x)} 分钟
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
