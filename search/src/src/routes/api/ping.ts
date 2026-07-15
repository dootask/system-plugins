import { createFileRoute } from '@tanstack/react-router'

// 健康检查 / 握手验证接口：GET /apps/search/api/ping（无鉴权，仅返回版本）
export const Route = createFileRoute('/api/ping')({
  server: {
    handlers: {
      GET: () =>
        Response.json({
          ok: true,
          app: 'search-dashboard',
          version: process.env.SEARCH_PLUGIN_VERSION ?? 'dev',
        }),
    },
  },
})
