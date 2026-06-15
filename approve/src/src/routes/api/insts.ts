import { createFileRoute } from '@tanstack/react-router'
import { createInstHandler, listInstsHandler } from '#/lib/handlers/insts'

// GET  /apps/approve/api/insts?box=todo|mine|cc → 列表
// POST /apps/approve/api/insts                  → 发起（defId + formData）
export const Route = createFileRoute('/api/insts')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => listInstsHandler(request),
      POST: ({ request }: { request: Request }) => createInstHandler(request),
    },
  },
})
