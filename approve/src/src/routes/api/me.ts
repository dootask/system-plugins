import { createFileRoute } from '@tanstack/react-router'
import { ok, requireUser } from '#/lib/auth'

// GET /apps/approve/api/me → 反查并返回当前用户身份与是否管理员。
// 身份以 x-user-token 反查主程序为准，不信任前端自报的 user-id。
export const Route = createFileRoute('/api/me')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const auth = await requireUser(request)
        if (auth instanceof Response) return auth
        return ok(auth)
      },
    },
  },
})
