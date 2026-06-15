import { createFileRoute } from '@tanstack/react-router'
import { actTaskHandler } from '#/lib/handlers/tasks'

// POST /apps/approve/api/tasks/:id/act → 处置任务(approve/reject/return/withdraw/transfer/addsign)
export const Route = createFileRoute('/api/tasks/$id/act')({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) => actTaskHandler(request),
    },
  },
})
