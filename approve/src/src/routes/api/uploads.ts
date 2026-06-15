import { createFileRoute } from '@tanstack/react-router'
import { uploadHandler } from '#/lib/handlers/uploads'

// POST /apps/approve/api/uploads → 上传附件到主程序，返回 { fileId, name, size, ext }
export const Route = createFileRoute('/api/uploads')({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) => uploadHandler(request),
    },
  },
})
