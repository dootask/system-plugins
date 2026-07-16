import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// 插件挂载在主程序的 /apps/search 前缀下，资源 URL 与路由都要带这个 base。
// 与 nginx.conf 的 location /apps/search/、menu_items.url 的 apps/search/ 必须完全一致。
const config = defineConfig({
  base: '/apps/search/',
  resolve: { tsconfigPaths: true },
  // 每次构建生成唯一 ID，供 __root 给无 hash 的 styles.css 拼 ?v= 缓存破坏参数
  //（CSS 用稳定文件名规避 SSR/client hash 不一致，代价是浏览器启发式缓存会跨版本粘住）
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  build: {
    rollupOptions: {
      output: {
        // CSS 用稳定文件名：SSR 环境与客户端环境对同一 styles.css 生成的
        // 内容 hash 不一致（tailwind 按环境扫描的类集合不同），带 hash 时
        // SSR 渲染的 <link> 会 404。去掉 hash 两端即对齐；缓存靠镜像版本更新。
        assetFileNames: (info) =>
          info.names?.[0]?.endsWith('.css')
            ? 'assets/[name][extname]'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [
    nitro({
      // 角标巡检：每 5 分钟检查失败堆积/锁卡死/服务异常，异常时给管理员菜单推红点。
      // node-server 预设启动时会拉起 croner 调度器执行 scheduledTasks。
      experimental: { tasks: true },
      tasks: {
        'search:badge-check': {
          handler: fileURLToPath(
            new URL('./src/tasks/badge-check.ts', import.meta.url),
          ),
          description: '搜索健康巡检 + 管理员角标推送',
        },
      },
      scheduledTasks: { '*/5 * * * *': ['search:badge-check'] },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
