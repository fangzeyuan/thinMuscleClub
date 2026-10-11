import type { CodeKind } from './targets'

export interface CodeSender {
  send(kind: CodeKind, target: string, code: string): Promise<void>
}

/**
 * 开发 / 内测用：验证码打印到服务端日志。
 * 生产环境禁止使用（env.ts 会拦截）。
 */
export function consoleSender(log: (msg: string) => void = console.log): CodeSender & { last: Map<string, string> } {
  const last = new Map<string, string>()
  return {
    last,
    async send(kind, target, code) {
      last.set(`${kind}:${target}`, code)
      log(`[验证码] ${kind === 'phone' ? '短信' : '邮件'} → ${target}：${code}（10 分钟内有效）`)
    },
  }
}

/** 腾讯云短信 / 邮件：需要通过签名、模板审核和域名验证后接入 */
export const notConfiguredSender = (name: string): CodeSender => ({
  async send() {
    throw new Error(`${name} 尚未配置`)
  },
})
