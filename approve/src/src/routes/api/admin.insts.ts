import { createFileRoute } from '@tanstack/react-router'
import { listAdminInstsHandler } from '#/lib/handlers/admin-insts'

export const Route = createFileRoute('/api/admin/insts')({
  server: {
    handlers: { GET: ({ request }) => listAdminInstsHandler(request) },
  },
})
