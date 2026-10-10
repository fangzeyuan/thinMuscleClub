import { TAG_GLYPH, type Tag } from '../data/exercises'

const HUE: Record<Tag, number> = {
  core: 158,
  shoulder: 200,
  arm: 220,
  chest: 250,
  back: 185,
  glute: 340,
  leg: 20,
  cardio: 35,
  posture: 140,
}

/** 动作占位图：正式版替换为动作演示视频/动图 */
export default function ExGlyph({ tag, size = 44 }: { tag: Tag; size?: number }) {
  const h = HUE[tag]
  return (
    <span
      className="ex-glyph"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `hsl(${h} 70% 95%)`,
        color: `hsl(${h} 55% 38%)`,
      }}
    >
      {TAG_GLYPH[tag]}
    </span>
  )
}
