import { useEffect, useState } from 'react'

const LINES = ['分析体型数据', '估算体脂与代谢', '匹配目标部位动作', '安排每周训练节奏']

export default function Generating({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (n >= LINES.length) {
      const t = setTimeout(onDone, 350)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setN(n + 1), 480)
    return () => clearTimeout(t)
  }, [n, onDone])

  return (
    <div className="screen generating">
      <div className="pulse" />
      <h2>正在生成你的薄肌计划</h2>
      <ul>
        {LINES.map((l, i) => (
          <li key={l} className={i < n ? 'done' : i === n ? 'doing' : ''}>
            <span className="dot" />
            {l}
          </li>
        ))}
      </ul>
    </div>
  )
}
