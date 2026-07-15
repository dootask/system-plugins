import { createFileRoute } from '@tanstack/react-router'
import { adminHandler, ok } from '#/lib/auth'
import { getStatus } from '#/lib/status'

// GET /apps/search/api/status → 仪表盘全量状态（管理员）
export const Route = createFileRoute('/api/status')({
  server: {
    handlers: {
      GET: adminHandler(async () => ok(await getStatus())),
    },
  },
})
