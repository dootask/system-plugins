import { createFileRoute } from '@tanstack/react-router'
import { adminHandler, ok } from '#/lib/auth'
import { dq } from '#/lib/db'
import { failuresTable, nextRetryDelayMinutes } from '#/lib/conventions'

interface FailureRow {
  id: number
  data_type: string
  data_id: number
  action: string
  error_message: string | null
  retry_count: number
  last_retry_at: string | null
  created_at: string
}

// GET  /apps/search/api/failures?limit=50 → 失败队列列表
// POST /apps/search/api/failures         → 全部立即重试（清 last_retry_at，下一轮 cron 即重试）
export const Route = createFileRoute('/api/failures')({
  server: {
    handlers: {
      GET: adminHandler(async ({ request }) => {
        const url = new URL(request.url)
        const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)))
        const rows = await dq<FailureRow>(
          `SELECT id, data_type, data_id, action, error_message, retry_count, last_retry_at, created_at
           FROM ${failuresTable()} ORDER BY updated_at DESC LIMIT ${limit}`,
        )
        return ok(
          rows.map((r) => ({
            ...r,
            // 复刻主程序退避表，给前端展示「下次重试约 X 分钟后」
            nextRetryInMinutes: r.last_retry_at
              ? Math.max(
                  0,
                  nextRetryDelayMinutes(r.retry_count) -
                    Math.round((Date.now() - new Date(String(r.last_retry_at)).getTime()) / 60_000),
                )
              : 0,
          })),
        )
      }),
      POST: adminHandler(async () => {
        const result = await dq<never>(
          `UPDATE ${failuresTable()} SET last_retry_at = NULL`,
        )
        return ok({ requeued: (result as unknown as { affectedRows?: number }).affectedRows ?? 0 })
      }),
    },
  },
})
