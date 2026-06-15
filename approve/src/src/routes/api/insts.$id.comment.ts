import { createFileRoute } from '@tanstack/react-router'
import { commentInstHandler } from '#/lib/handlers/insts'
import { lastId } from '#/lib/handlers/util'

// POST /apps/approve/api/insts/:id/comment → 在审批单上留言（写时间线，不改流转状态）
export const Route = createFileRoute('/api/insts/$id/comment')({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) => {
        const id = lastId(request)
        if (!id)
          return Promise.resolve(
            Response.json({ error: '缺少 id' }, { status: 404 }),
          )
        return commentInstHandler(request, id)
      },
    },
  },
})
