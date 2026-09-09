import { createFileRoute } from '@tanstack/react-router'
import { voidInstHandler } from '#/lib/handlers/admin-insts'

export const Route = createFileRoute('/api/admin/insts/$id/void')({
  server: { handlers: { POST: ({ request }) => voidInstHandler(request) } },
})
