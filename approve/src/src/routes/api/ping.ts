import { createFileRoute } from '@tanstack/react-router'

// 健康检查 / 握手验证接口：GET /apps/approve/api/ping
export const Route = createFileRoute('/api/ping')({
  server: {
    handlers: {
      GET: () =>
        Response.json({
          ok: true,
          app: 'approve',
          version: process.env.APPROVE_VERSION ?? 'dev',
        }),
    },
  },
})
