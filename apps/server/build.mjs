// 生产构建：打包自己的代码和 @tmc/core（TS 源码），npm 依赖保持外部引用
import { build } from 'esbuild'
import { cpSync, readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@tmc/'))

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/index.js',
  external: [...external, ...external.map((d) => `${d}/*`)],
})
cpSync('drizzle', 'dist/drizzle', { recursive: true })
console.log('built dist/index.js')
