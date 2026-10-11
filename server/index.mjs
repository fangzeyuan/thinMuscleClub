// 生产环境：npm run build 后执行 npm start，同时提供静态页面和 /api 代理
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi, llmConfig } from './llm-proxy.mjs'

try {
  process.loadEnvFile?.(fileURLToPath(new URL('../.env', import.meta.url)))
} catch {
  // 没有 .env 时直接使用环境变量
}

const DIST = fileURLToPath(new URL('../dist', import.meta.url))
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }
const cfg = llmConfig()
const port = Number(process.env.PORT || 3000)

createServer(async (req, res) => {
  if (await handleApi(req, res, cfg)) return
  const path = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '')
  let file = join(DIST, path)
  try {
    if (!(await stat(file)).isFile()) throw 0
  } catch {
    file = join(DIST, 'index.html') // SPA 回退
  }
  try {
    const buf = await readFile(file)
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream')
    res.end(buf)
  } catch {
    res.statusCode = 404
    res.end('Not found')
  }
}).listen(port, () => console.log(`薄肌俱乐部 → http://localhost:${port}  (AI: ${cfg.provider} / ${cfg.model}${cfg.apiKey ? '' : '，未配置 Key'})`))
