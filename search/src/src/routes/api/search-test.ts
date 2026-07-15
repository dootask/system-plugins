import { createFileRoute } from '@tanstack/react-router'
import { adminHandler, badRequest, ok } from '#/lib/auth'
import { searchTest } from '#/lib/engine'
import { DATA_TYPES, type DataType } from '#/lib/conventions'

// GET /apps/search/api/search-test?q=..&type=msg&mode=hybrid → 测试台
// 直接以引擎视角查询（不做权限过滤），仅管理员可用。
export const Route = createFileRoute('/api/search-test')({
  server: {
    handlers: {
      GET: adminHandler(async ({ request }) => {
        const url = new URL(request.url)
        const q = (url.searchParams.get('q') || '').trim().slice(0, 500)
        const type = (url.searchParams.get('type') || 'msg') as DataType
        const mode = url.searchParams.get('mode') || 'hybrid'
        if (!q) return badRequest('q required')
        if (!DATA_TYPES.includes(type)) return badRequest('invalid type')
        if (!['fulltext', 'vector', 'hybrid'].includes(mode)) return badRequest('invalid mode')
        const started = Date.now()
        const hits = await searchTest(type, q, mode as 'fulltext' | 'vector' | 'hybrid')
        return ok({ hits, tookMs: Date.now() - started })
      }),
    },
  },
})
