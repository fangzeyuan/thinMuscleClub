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

/** SMTP 发信（内测阶段用 QQ 邮箱 / 163 邮箱即可） */
export async function smtpSender(cfg: { host: string; port: number; user: string; pass: string; from: string }): Promise<CodeSender> {
  const { createTransport } = await import('nodemailer')
  const transport = createTransport({ host: cfg.host, port: cfg.port, secure: cfg.port === 465, auth: { user: cfg.user, pass: cfg.pass } })
  return {
    async send(_kind, target, code) {
      await transport.sendMail({
        from: cfg.from || `薄肌俱乐部 <${cfg.user}>`,
        to: target,
        subject: `薄肌俱乐部验证码：${code}`,
        text: `你的登录验证码是 ${code}，10 分钟内有效。\n\n如果不是你本人操作，请忽略这封邮件。`,
      })
    },
  }
}
