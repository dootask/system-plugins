import { createFileRoute } from '@tanstack/react-router'
import { adminHandler, badRequest, ok } from '#/lib/auth'
import { dq } from '#/lib/db'
import { failuresTable } from '#/lib/conventions'

// POST   /apps/search/api/failures/:id → 单条立即重试（清 last_retry_at）
// DELETE /apps/search/api/failures/:id → 删除失败记录（放弃重试）
export const Route = createFileRoute('/api/failures/$id')({
  server: {
    handlers: {
      POST: adminHandler(async ({ request }) => {
        const id = idFrom(request)
        if (!id) return badRequest('invalid id')
        await dq(`UPDATE ${failuresTable()} SET last_retry_at = NULL WHERE id = ?`, [id])
        return ok({ requeued: id })
      }),
      DELETE: adminHandler(async ({ request }) => {
        const id = idFrom(request)
        if (!id) return badRequest('invalid id')
        await dq(`DELETE FROM ${failuresTable()} WHERE id = ?`, [id])
        return ok({ deleted: id })
      }),
    },
  },
})

function idFrom(request: Request): number {
  const seg = new URL(request.url).pathname.split('/').pop() || ''
  const id = parseInt(seg, 10)
  return Number.isFinite(id) && id > 0 ? id : 0
}
