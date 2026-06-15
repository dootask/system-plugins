import { createFileRoute } from '@tanstack/react-router'
import { getUploadHandler } from '#/lib/handlers/uploads'
import { lastId } from '#/lib/handlers/util'

// GET /apps/approve/api/uploads/:id → 取文件元信息（含 content_url），供查看/下载
export const Route = createFileRoute('/api/uploads/$id')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => {
        const id = lastId(request)
        if (!id)
          return Promise.resolve(
            Response.json({ error: '缺少 id' }, { status: 404 }),
          )
        return getUploadHandler(request, id)
      },
    },
  },
})
