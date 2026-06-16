import { createFileRoute } from '@tanstack/react-router'
import { forbidden, ok, requireUser } from '#/lib/auth'
import { serverT } from '#/lib/i18n/server'
import { ensureBuiltinSeeded, seedBuiltinTemplates } from '#/lib/seed/builtin'

// 内置模板播种入口（首启已自动播种；此为管理员手动补播/强制播种的备用入口）。
// POST /apps/approve/api/admin/seed              → 幂等播种（仅当库内无模板时注入内置模板）。
// POST /apps/approve/api/admin/seed { force:1 }  → 强制按名补齐缺失的内置模板（不删已有）。
export const Route = createFileRoute('/api/admin/seed')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = await requireUser(request)
        if (auth instanceof Response) return auth
        if (!auth.isAdmin) return forbidden(serverT(request)('server.err.adminOnly'))
        const url = new URL(request.url)
        const force = url.searchParams.get('force') === '1'
        const result = force ? seedBuiltinTemplates() : ensureBuiltinSeeded()
        return ok(result)
      },
    },
  },
})
