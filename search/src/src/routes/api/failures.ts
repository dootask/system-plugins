import { createFileRoute } from '@tanstack/react-router'
import { adminHandler, badRequest, ok } from '#/lib/auth'
import { dq } from '#/lib/db'
import { DATA_TYPES, failuresTable, nextRetryDelayMinutes, type DataType } from '#/lib/conventions'

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

const CLEAR_CHUNK = 5000

// GET  /apps/search/api/failures?limit=50 → 失败队列列表
// POST /apps/search/api/failures         → 全部立即重试（清 last_retry_at，下一轮 cron 即重试）
// DELETE /apps/search/api/failures[?type=msg] → 清空失败队列（可按类型）。放弃补齐：这些数据不会再被自动写入索引
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
      DELETE: adminHandler(async ({ request }) => {
        const type = new URL(request.url).searchParams.get('type')
        if (type && !DATA_TYPES.includes(type as DataType)) return badRequest('invalid type')
        // 十几万条时单条 DELETE 会长时间占表锁并阻塞主程序的写入/重试，分批删
        const where = type ? 'WHERE data_type = ?' : ''
        let deleted = 0
        for (;;) {
          const result = await dq<never>(
            `DELETE FROM ${failuresTable()} ${where} LIMIT ${CLEAR_CHUNK}`,
            type ? [type] : [],
          )
          const n = (result as unknown as { affectedRows?: number }).affectedRows ?? 0
          deleted += n
          if (n < CLEAR_CHUNK) break
        }
        return ok({ deleted })
      }),
    },
  },
})
