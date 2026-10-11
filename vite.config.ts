import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error 纯 JS 模块，与生产服务器共用
import { handleApi, llmConfig } from './server/llm-proxy.mjs'

export default defineConfig(({ mode }) => {
  const cfg = llmConfig(loadEnv(mode, process.cwd(), ''))
  return {
    plugins: [
      react(),
      {
        name: 'llm-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!(await handleApi(req, res, cfg))) next()
          })
        },
      },
    ],
    server: { port: 5173, host: true },
  }
})
