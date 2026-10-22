import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

// 统一读取仓库根目录的 .env（和 Web 端、AI 配置共用）
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(8787),
  /**
   * postgres://… 使用 PostgreSQL（线上：腾讯云）
   * pglite://目录  使用内嵌 PGlite（本地开发，无需 Docker）
   * pglite://memory 内存数据库（测试）
   */
  DATABASE_URL: z.string().default('pglite://./.data/pglite'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET 至少 32 个字符'),
  /** 验证码哈希用的密钥（防止数据库泄露后被暴力还原） */
  CODE_PEPPER: z.string().min(16),
  /** console = 验证码打印在服务端日志（仅开发）；none = 关闭这种登录方式 */
  SMS_PROVIDER: z.enum(['console', 'tencent', 'none']).default('console'),
  EMAIL_PROVIDER: z.enum(['console', 'smtp', 'none']).default('console'),
  /** SMTP 发信（如 QQ 邮箱：smtp.qq.com / 465 / 邮箱地址 / 授权码） */
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default(''),
  /** 内测白名单：逗号分隔的邮箱 / 手机号。为空 = 开放注册。已注册的账号不受影响 */
  SIGNUP_ALLOWLIST: z.string().default(''),
  /** 网页构建产物目录（生产环境由服务端直接提供网页）；为空则不提供 */
  WEB_DIST: z.string().default(''),
  LLM_BASE_URL: z.string().default('https://dashscope.aliyuncs.com/compatible-mode/v1'),
  LLM_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default('qwen-plus'),
  /** 额外请求参数（JSON），会覆盖按模型自动设置的思考档位，例如 {"reasoning_effort":"high"} */
  LLM_EXTRA_BODY: z.string().default(''),
})

export type Env = z.infer<typeof schema>

export function loadEnv(overrides: Partial<Record<keyof Env, unknown>> = {}): Env {
  const env = schema.parse({ ...process.env, ...overrides })
  if (env.NODE_ENV === 'production') {
    if (env.DATABASE_URL.startsWith('pglite')) throw new Error('生产环境必须使用 PostgreSQL')
    if (env.SMS_PROVIDER === 'console' || env.EMAIL_PROVIDER === 'console') throw new Error('生产环境不能把验证码打印到日志')
    if (env.EMAIL_PROVIDER === 'smtp' && (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS)) throw new Error('EMAIL_PROVIDER=smtp 需要配置 SMTP_HOST / SMTP_USER / SMTP_PASS')
    if (env.SMS_PROVIDER === 'none' && env.EMAIL_PROVIDER === 'none') throw new Error('至少要开启一种登录方式')
  }
  return env
}
