import { createFileRoute } from '@tanstack/react-router'
import { resubmitHandler } from '#/lib/handlers/tasks'
import { lastId } from '#/lib/handlers/util'

// POST /apps/approve/api/insts/:id/resubmit → 退回后发起人改表单重新提交
export const Route = createFileRoute('/api/insts/$id/resubmit')({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) => {
        const id = lastId(request)
        if (!id)
          return Promise.resolve(
            Response.json({ error: '缺少 id' }, { status: 404 }),
          )
        return resubmitHandler(request, id)
      },
    },
  },
})
