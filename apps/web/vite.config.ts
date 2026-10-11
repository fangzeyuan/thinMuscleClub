import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 开发时 /api 转发到本地服务端（apps/server，默认 8787）
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': { target: `http://localhost:${process.env.API_PORT ?? 8787}`, changeOrigin: true } },
  },
})
