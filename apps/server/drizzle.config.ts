import { defineConfig } from 'drizzle-kit'

// 只用来根据 schema.ts 生成 SQL 迁移文件：npm run db:generate -w @tmc/server
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
})
