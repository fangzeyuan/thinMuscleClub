import { useCallback, useEffect, useRef, useState } from 'react'
import type { Pt } from './iso'

const SPEED = 3.2 // 格/秒

/** 角色在网格上行走：先走 x 再走 y（等距视角下看起来是沿着街道走） */
export function useWalker(initial: Pt) {
  const [pos, setPos] = useState<Pt>(initial)
  const [walking, setWalking] = useState(false)
  const [facingLeft, setFacingLeft] = useState(false)
  const raf = useRef(0)
  const posRef = useRef(pos)
  posRef.current = pos

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const walkTo = useCallback((target: Pt, onArrive?: () => void) => {
    cancelAnimationFrame(raf.current)
    const start = posRef.current
    const corner = { x: target.x, y: start.y }
    const legs = [
      [start, corner],
      [corner, target],
    ].filter(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y) > 0.01)
    if (!legs.length) {
      onArrive?.()
      return
    }
    setWalking(true)
    let leg = 0
    let t0 = performance.now()
    const step = (now: number) => {
      const [a, b] = legs[leg]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      // 屏幕上向左走 = x 减小或 y 增大
      setFacingLeft(b.x - a.x < 0 || b.y - a.y > 0)
      const k = Math.min(1, ((now - t0) / 1000) * (SPEED / len))
      setPos({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k })
      if (k < 1) {
        raf.current = requestAnimationFrame(step)
      } else if (++leg < legs.length) {
        t0 = now
        raf.current = requestAnimationFrame(step)
      } else {
        setWalking(false)
        onArrive?.()
      }
    }
    raf.current = requestAnimationFrame(step)
  }, [])

  const jumpTo = useCallback((p: Pt) => {
    cancelAnimationFrame(raf.current)
    setWalking(false)
    setPos(p)
  }, [])

  return { pos, walking, facingLeft, walkTo, jumpTo }
}
