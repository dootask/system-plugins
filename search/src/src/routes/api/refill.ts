import { createFileRoute } from '@tanstack/react-router'
import { adminHandler, badRequest, ok } from '#/lib/auth'
import { kvSet, truncateTable } from '#/lib/engine'
import { DATA_TYPES, KV_POINTER_KEYS, type DataType } from '#/lib/conventions'

// POST /apps/search/api/refill {type} → 单类型全量重灌：
// 清空该类型索引表 + 同步指针归零，下一轮 cron（≤2 分钟）开始从头重灌。
// 期间该类型搜索结果不完整，前端有确认框。
export const Route = createFileRoute('/api/refill')({
  server: {
    handlers: {
      POST: adminHandler(async ({ request, user }) => {
        const body = (await request.json().catch(() => ({}))) as { type?: string }
        const type = body.type as DataType
        if (!DATA_TYPES.includes(type)) return badRequest('invalid type')
        await truncateTable(type)
        await kvSet(KV_POINTER_KEYS[type], '0')
        console.log(`[search-dashboard] refill ${type} triggered by admin ${user.userid}`)
        return ok({ refilling: type })
      }),
    },
  },
})
