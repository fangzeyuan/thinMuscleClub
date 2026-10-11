export type CodeKind = 'phone' | 'email'

/** 统一格式：手机号 → +86XXXXXXXXXXX（目前只支持中国大陆）；邮箱 → 去空格小写 */
export function normalizeTarget(kind: CodeKind, raw: string): string | null {
  const v = raw.trim()
  if (kind === 'phone') {
    const digits = v.replace(/[\s-]/g, '').replace(/^\+?86/, '')
    return /^1[3-9]\d{9}$/.test(digits) ? `+86${digits}` : null
  }
  const email = v.toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null
}

/** 脱敏展示：138****5678 / a***@example.com */
export function maskTarget(kind: string, value: string) {
  if (kind === 'phone') {
    const d = value.replace(/^\+86/, '')
    return `${d.slice(0, 3)}****${d.slice(-4)}`
  }
  if (kind === 'email') {
    const [name, domain] = value.split('@')
    return `${name.slice(0, 1)}***@${domain}`
  }
  return '***'
}
