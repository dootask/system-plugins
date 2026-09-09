import { createFileRoute } from '@tanstack/react-router'
import { uploadHandler, uploadLimitsHandler } from '#/lib/handlers/uploads'

// GET 返回当前附件上限；POST 保存插件本地附件。
export const Route = createFileRoute('/api/uploads')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => uploadLimitsHandler(request),
      POST: ({ request }: { request: Request }) => uploadHandler(request),
    },
  },
})
