import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// repo 单测：纯 Node 环境，用内存 SQLite（见各 *.test.ts 的 setDbForTesting）。
// 显式声明 #/* 别名，避免依赖 vite 的 tsconfigPaths 插件链。
export default defineConfig({
  resolve: {
    alias: {
      '#': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
