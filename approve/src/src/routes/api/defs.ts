import { createFileRoute } from '@tanstack/react-router'
import { ok, requireUser } from '#/lib/auth'
import { listDefs } from '#/lib/repo/defs'
import { createDefHandler, listAllDefsHandler } from '#/lib/handlers/defs'
import { query } from '#/lib/handlers/util'

// GET /apps/approve/api/defs        → 已发布(启用)模板列表（供发起页选模板）。
// GET /apps/approve/api/defs?all=1  → 管理端全量列表（含停用，仅管理员）。
// POST /apps/approve/api/defs       → 新建模板（管理员）。
export const Route = createFileRoute('/api/defs')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (query(request, 'all') === '1') return listAllDefsHandler(request)
        const auth = await requireUser(request)
        if (auth instanceof Response) return auth
        const defs = listDefs({ onlyEnabled: true }).map((d) => ({
          id: d.id,
          name: d.name,
          category: d.category,
          icon: d.icon,
          version: d.version,
          sort_order: d.sort_order,
        }))
        return ok(defs)
      },
      POST: ({ request }: { request: Request }) => createDefHandler(request),
    },
  },
})
