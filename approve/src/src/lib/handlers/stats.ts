import { ok, requireUser } from '#/lib/auth'
import { countByStatus } from '#/lib/repo/insts'
import { listPendingForUser } from '#/lib/repo/tasks'

/**
 * GET /api/stats → 审批数据统计。
 * - 管理员：全量实例按状态汇总。
 * - 普通用户：仅本人发起的实例汇总。
 * 另附当前用户「待我审批」数量。
 */
export async function statsHandler(request: Request): Promise<Response> {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth

  const scope = auth.isAdmin ? 'all' : 'mine'
  const byStatus = countByStatus(scope, auth.userId)
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0)
  const todo = listPendingForUser(auth.userId).length

  return ok({ scope, total, byStatus, todo })
}
