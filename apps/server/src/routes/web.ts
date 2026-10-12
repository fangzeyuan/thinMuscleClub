import fastifyStatic from '@fastify/static'
import type { FastifyInstance } from 'fastify'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 生产环境由服务端直接提供网页（单页应用）：
 * - /assets/* 文件名带哈希，长期缓存
 * - index.html、sw.js、manifest 不缓存，保证发版后立刻生效
 * - 其他非 /api 路径回退到 index.html
 */
export async function webRoutes(app: FastifyInstance, dir: string) {
  const root = resolve(dir)
  if (!existsSync(resolve(root, 'index.html'))) throw new Error(`WEB_DIST 目录里没有 index.html：${root}`)
  await app.register(fastifyStatic, {
    root,
    wildcard: false,
    cacheControl: false, // 由下面的 setHeaders 统一设置
    setHeaders(res, path) {
      res.setHeader('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
    },
  })
  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' || req.url.startsWith('/api/')) return reply.status(404).send({ error: 'not_found', message: '接口不存在' })
    return reply.header('Cache-Control', 'no-cache').sendFile('index.html')
  })
}
