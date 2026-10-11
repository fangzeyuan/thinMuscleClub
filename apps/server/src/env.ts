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
  /** console = 验证码打印在服务端日志（开发 / 内测） */
  SMS_PROVIDER: z.enum(['console', 'tencent']).default('console'),
  EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  LLM_BASE_URL: z.string().default('https://dashscope.aliyuncs.com/compatible-mode/v1'),
  LLM_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default('qwen-plus'),
})

export type Env = z.infer<typeof schema>

export function loadEnv(overrides: Partial<Record<keyof Env, unknown>> = {}): Env {
  const env = schema.parse({ ...process.env, ...overrides })
  if (env.NODE_ENV === 'production') {
    if (env.DATABASE_URL.startsWith('pglite')) throw new Error('生产环境必须使用 PostgreSQL')
    if (env.SMS_PROVIDER === 'console' || env.EMAIL_PROVIDER === 'console') throw new Error('生产环境不能把验证码打印到日志')
  }
  return env
}
