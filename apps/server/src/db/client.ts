import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import * as schema from './schema'

export type Db = ReturnType<typeof drizzlePg<typeof schema>>

// 开发时在 src/db/ 下（../../drizzle），打包后在 dist/ 下（./drizzle）
const MIGRATIONS = [new URL('./drizzle', import.meta.url), new URL('../../drizzle', import.meta.url)]
  .map((u) => fileURLToPath(u))
  .find((p) => existsSync(p))!

/**
 * 根据 DATABASE_URL 选择驱动，表结构和迁移文件两种驱动共用：
 * - postgres://…    PostgreSQL（线上）
 * - pglite://目录    内嵌 PGlite，持久化到目录（本地开发，无需 Docker）
 * - pglite://memory  内存（测试）
 */
export async function openDb(url: string, migrationsDir = MIGRATIONS): Promise<{ db: Db; close: () => Promise<void> }> {
  if (url.startsWith('pglite://')) {
    const dir = url.slice('pglite://'.length)
    if (dir !== 'memory') mkdirSync(dir, { recursive: true })
    const client = new PGlite(dir === 'memory' ? undefined : dir)
    const db = drizzlePglite(client, { schema })
    await migratePglite(db, { migrationsFolder: migrationsDir })
    return { db: db as unknown as Db, close: () => client.close() }
  }
  const pool = new pg.Pool({ connectionString: url, max: 10 })
  const db = drizzlePg(pool, { schema })
  await migratePg(db, { migrationsFolder: migrationsDir })
  return { db, close: () => pool.end() }
}
