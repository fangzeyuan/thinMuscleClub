import { useEffect, useState } from 'react'
import { ApiError, authApi, type AuthConfig, type CodeKind } from '../lib/api'

export default function Login({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<CodeKind>('phone')
  const [target, setTarget] = useState('')
  const [code, setCode] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [config, setConfig] = useState<AuthConfig | null>(null)

  // 服务端开放了哪些登录方式（内测阶段只开邮箱）
  useEffect(() => {
    authApi.config().then(
      (c) => {
        setConfig(c)
        if (!c.methods.phone && c.methods.email) setKind('email')
      },
      () => setError('网络不可用，请联网后再登录'),
    )
  }, [])
  const methods = (['phone', 'email'] as const).filter((m) => config?.methods[m] ?? true)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const validTarget = kind === 'phone' ? /^1[3-9]\d{9}$/.test(target.replace(/\s/g, '')) : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(target.trim())

  const send = async () => {
    setError(null)
    setBusy(true)
    try {
      const r = await authApi.sendCode(kind, target)
      setSent(true)
      setCooldown(r.cooldown)
      if (r.devCode) {
        setDevCode(r.devCode)
        setCode(r.devCode)
      }
    } catch (e) {
      const err = e as ApiError
      setError(err.message)
      if (err.code === 'too_frequent') setCooldown(Number(err.data?.retryAfter) || 60)
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (!agreed) return setError('请先阅读并同意隐私政策和健康数据处理说明')
    setError(null)
    setBusy(true)
    try {
      await authApi.verify(kind, target, code, ['privacy_policy', 'health_data'])
      onDone()
    } catch (e) {
      setError((e as ApiError).message)
      setBusy(false)
    }
  }

  return (
    <div className="screen login">
      <div className="login-hero">
        <div className="brand">
          <span className="brand-mark" />
          薄肌俱乐部
        </div>
        <h1>
          不练成大块头
          <br />
          只练出<em>好线条</em>
        </h1>
        <p className="lead">登录后，数据会安全地保存在云端，换手机也不会丢。</p>
      </div>

      <div className="login-form">
        {config?.inviteOnly && <p className="invite-hint">内测中：仅限受邀的{methods.length === 1 && methods[0] === 'email' ? '邮箱' : '账号'}注册</p>}
        {methods.length > 1 && (
          <div className="seg two">
            {(
              [
                ['phone', '手机号'],
                ['email', '邮箱'],
              ] as const
            ).map(([k, t]) => (
              <button
                key={k}
                className={kind === k ? 'on' : ''}
                onClick={() => {
                  setKind(k)
                  setTarget('')
                  setCode('')
                  setSent(false)
                  setCooldown(0)
                  setError(null)
                }}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <div className="login-row">
          <input
            className="text-input"
            type={kind === 'phone' ? 'tel' : 'email'}
            inputMode={kind === 'phone' ? 'numeric' : 'email'}
            autoComplete={kind === 'phone' ? 'tel' : 'email'}
            placeholder={kind === 'phone' ? '手机号' : '邮箱地址'}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <button className="btn ghost code-btn" disabled={!validTarget || cooldown > 0 || busy} onClick={send}>
            {cooldown > 0 ? `${cooldown} 秒` : sent ? '重新发送' : '获取验证码'}
          </button>
        </div>

        <input
          className="text-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="6 位验证码"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />

        <label className="consent">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>我已阅读并同意《隐私政策》和《健康数据处理说明》，同意薄肌俱乐部处理我的身体数据、饮食和训练记录。</span>
        </label>

        {error && <p className="login-error">{error}</p>}

        <button className="btn primary block" disabled={code.length !== 6 || !validTarget || busy} onClick={submit}>
          {busy ? '请稍候…' : '登录 / 注册'}
        </button>
        {devCode && <p className="dev-code">开发环境验证码：{devCode}（已自动填入，正式环境会发短信 / 邮件）</p>}
      </div>
    </div>
  )
}
