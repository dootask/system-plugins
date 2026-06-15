import { createFileRoute } from '@tanstack/react-router'
import { serveUploadHandler } from '#/lib/handlers/uploads'

// GET /apps/approve/api/uploads/:name → 回上传文件字节（位图内联 / 其余下载）。
export const Route = createFileRoute('/api/uploads/$name')({
  server: {
    handlers: {
      GET: ({ request, params }: { request: Request; params: { name: string } }) =>
        serveUploadHandler(request, params.name),
    },
  },
})
