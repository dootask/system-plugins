import { createFileRoute } from '@tanstack/react-router'
import { statsHandler } from '#/lib/handlers/stats'

// GET /apps/approve/api/stats → 审批数据统计（管理员=全量；普通用户=本人发起）。
export const Route = createFileRoute('/api/stats')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => statsHandler(request),
    },
  },
})
