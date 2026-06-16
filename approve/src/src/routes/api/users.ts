import { createFileRoute } from '@tanstack/react-router'
import { getRequestToken, ok, requireUser } from '#/lib/auth'
import { resolveUsers } from '#/lib/dootask-server'

// GET /apps/approve/api/users?ids=1,2,3 → 批量解析用户昵称（发起人/审批人展示用）。
export const Route = createFileRoute('/api/users')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const auth = await requireUser(request)
        if (auth instanceof Response) return auth
        const url = new URL(request.url)
        const ids = (url.searchParams.get('ids') || '')
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n))
        if (ids.length === 0) return ok([])
        const token = getRequestToken(request)
        const map = await resolveUsers(ids, token)
        return ok(Object.values(map))
      },
    },
  },
})
