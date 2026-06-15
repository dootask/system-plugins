import { createFileRoute } from '@tanstack/react-router'
import { getInstDetail } from '#/lib/handlers/insts'

// GET /apps/approve/api/insts/:id → 审批单详情（inst+formData+events+task+actors）
export const Route = createFileRoute('/api/insts/$id')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => getInstDetail(request),
    },
  },
})
