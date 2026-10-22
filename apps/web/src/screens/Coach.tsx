import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { checkAiConfig } from '../lib/ai'
import type { ChatMsg } from '../lib/store'
import { chatTime, needsTimeDivider } from '../lib/time'

interface Props {
  chat: ChatMsg[]
  sending: boolean
  onSend: (text: string) => void
  onRetry: (errorMsgId: string) => void
  onClear: () => void
}

const QUICK = ['帮我做今日总结', '刚喝了两杯水', '今天体重 62.3', '中午吃了黄焖鸡米饭', '练了一个月没变化，好焦虑']

export default function Coach({ chat, sending, onSend, onRetry, onClear }: Props) {
  const [text, setText] = useState('')
  const [cfg, setCfg] = useState<{ configured: boolean; model?: string; provider?: string } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 输入框随内容自动撑高（最多约 5 行，超出后框内滚动）
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    if (!text) {
      // 空的时候保持一行高（不让占位文字撑高）
      el.style.height = ''
      el.style.overflowY = 'hidden'
      return
    }
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
    el.style.overflowY = el.scrollHeight > 132 ? 'auto' : 'hidden'
  }, [text])

  useEffect(() => {
    checkAiConfig().then(setCfg)
  }, [])
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chat.length, sending])

  const send = (t: string) => {
    if (!t.trim() || sending) return
    onSend(t)
    setText('')
  }

  // 把连续的 tool 消息合并成一组同步标签
  const items: ({ kind: 'msg'; m: ChatMsg; ts: number } | { kind: 'sync'; id: string; labels: string[]; ts: number })[] = []
  for (const m of chat) {
    if (m.role === 'tool') {
      if (!m.label) continue
      const last = items[items.length - 1]
      if (last?.kind === 'sync') last.labels.push(m.label)
      else items.push({ kind: 'sync', id: m.id, labels: [m.label], ts: m.ts })
    } else if (m.content || m.pending) {
      items.push({ kind: 'msg', m, ts: m.ts })
    }
  }
  const lastId = items.at(-1)?.kind === 'msg' ? (items.at(-1) as { m: ChatMsg }).m.id : null
  const streaming = chat.some((m) => m.pending)
  // 相隔 5 分钟以上或跨天时插入一条时间
  const now = new Date()
  let prevTs: number | null = null
  const withTime = items.map((it) => {
    const show = needsTimeDivider(prevTs, it.ts)
    prevTs = it.ts
    return { it, time: show ? chatTime(it.ts, now) : null }
  })

  return (
    <div className="screen coach">
      <header className="coach-head">
        <span className="avatar lg">薄</span>
        <div>
          <b>小薄 · 你的薄肌教练</b>
          <span className="muted small">{cfg?.configured ? `${cfg.provider} · ${cfg.model} · 已连接 App 数据` : '已连接 App 数据'}</span>
        </div>
        {chat.length > 0 && (
          <button className="link" onClick={onClear}>
            清空
          </button>
        )}
      </header>

      <div className="chat-body">
        {cfg && !cfg.configured && (
          <div className="setup-card">
            <b>还没有配置 AI 模型</b>
            <p>
              在项目根目录创建 <code>.env</code>（参考 <code>.env.example</code>），填入通义千问 / OpenAI / DeepSeek 的 API Key，然后重启 <code>npm run dev</code>。
            </p>
          </div>
        )}

        {items.length === 0 && (
          <div className="chat-empty">
            <span className="avatar xl">薄</span>
            <h3>嗨，我是小薄</h3>
            <p>
              我能看到你在 App 里记录的睡、练、吃、水。
              <br />
              你也可以直接告诉我"中午吃了什么""今天体重多少"，我会自动帮你记到 App 里。
            </p>
          </div>
        )}

        {withTime.map(({ it, time }) => (
          <Fragment key={it.kind === 'sync' ? it.id : it.m.id}>
            {time && <div className="chat-time">{time}</div>}
            {it.kind === 'sync' ? (
            <div className="sync-row">
              {it.labels.map((l, i) => (
                <span key={i} className="sync-chip">
                  <i>✓</i>
                  {l}
                </span>
              ))}
            </div>
          ) : (
            <div className={`bubble ${it.m.role} ${it.m.error ? 'error' : ''} ${it.m.pending && !it.m.content ? 'typing' : ''}`}>
              {it.m.pending && !it.m.content ? (
                <>
                  <i />
                  <i />
                  <i />
                  {it.m.phase === 'thinking' && <span className="typing-label">思考中</span>}
                  {it.m.phase === 'tools' && <span className="typing-label">正在记录</span>}
                </>
              ) : (
                <>
                  {it.m.content}
                  {it.m.pending && <span className="cursor" />}
                  {it.m.error && it.m.retryable && it.m.id === lastId && (
                    <button className="retry" disabled={sending} onClick={() => onRetry(it.m.id)}>
                      重试
                    </button>
                  )}
                </>
              )}
            </div>
            )}
          </Fragment>
        ))}

        {sending && !streaming && (
          <div className="bubble assistant typing">
            <i />
            <i />
            <i />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="chat-input">
        <div className="chips scroll-x">
          {QUICK.map((q) => (
            <button key={q} className="chip-btn" disabled={sending} onClick={() => send(q)}>
              {q}
            </button>
          ))}
        </div>
        <form
          className="input-row"
          onSubmit={(e) => {
            e.preventDefault()
            send(text)
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // 回车发送，Shift+回车换行；中文输入法选字时的回车不发送
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault()
                send(text)
              }
            }}
            placeholder="吃了什么、睡得怎样…"
            enterKeyHint="send"
          />
          <button type="submit" className="send" disabled={!text.trim() || sending} aria-label="发送">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
