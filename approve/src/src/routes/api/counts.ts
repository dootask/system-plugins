import { createFileRoute } from '@tanstack/react-router'
import { listCountsHandler } from '#/lib/handlers/insts'

// GET /apps/approve/api/counts → 当前用户 { todo, done, cc, mine } 数量（侧边栏角标）。
export const Route = createFileRoute('/api/counts')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => listCountsHandler(request),
    },
  },
})
