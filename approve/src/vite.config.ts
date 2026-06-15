import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// 插件挂载在主程序的 /apps/approve 前缀下，资源 URL 与路由都要带这个 base。
// 与 nginx.conf 的 location /apps/approve/、menu_items.url 的 apps/approve/ 必须完全一致。
const config = defineConfig({
  base: '/apps/approve/',
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    nitro({
      rollupConfig: { external: [/^@sentry\//] },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
