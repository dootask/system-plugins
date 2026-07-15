import { createFileRoute } from '@tanstack/react-router'
import { adminHandler, badRequest, ok } from '#/lib/auth'
import { kvDel } from '#/lib/engine'
import { KV_SCHEMA_KEY } from '#/lib/conventions'

// POST /apps/search/api/rebuild {confirm:"REBUILD"} → 全量重建：
// 删除表结构标记 vector:schema，主程序下一次同步（≤2 分钟）发现标记缺失即
// DROP+CREATE 全部 5 表并重灌。危险操作：期间搜索结果不完整（数小时）。
export const Route = createFileRoute('/api/rebuild')({
  server: {
    handlers: {
      POST: adminHandler(async ({ request, user }) => {
        const body = (await request.json().catch(() => ({}))) as { confirm?: string }
        if (body.confirm !== 'REBUILD') return badRequest('confirm required')
        await kvDel(KV_SCHEMA_KEY)
        console.log(`[search-dashboard] full rebuild triggered by admin ${user.userid}`)
        return ok({ rebuilding: true })
      }),
    },
  },
})
