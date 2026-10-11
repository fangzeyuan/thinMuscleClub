import { buildApp } from './app'
import { openDb } from './db/client'
import { loadEnv } from './env'

const env = loadEnv()
const { db, close } = await openDb(env.DATABASE_URL)
const app = await buildApp({ env, db })

const shutdown = async () => {
  await app.close()
  await close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await app.listen({ port: env.API_PORT, host: '0.0.0.0' })
app.log.info(`数据库：${env.DATABASE_URL.startsWith('pglite') ? `PGlite (${env.DATABASE_URL})` : 'PostgreSQL'}；验证码：${env.SMS_PROVIDER}/${env.EMAIL_PROVIDER}`)
