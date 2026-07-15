/**
 * 健康巡检 + 管理员菜单角标。
 *
 * 每 5 分钟（nitro scheduledTasks）评估健康状态：
 * - 失败队列有 30 分钟以上未消化的记录
 * - 任一同步锁疑似卡死（进程被杀留下的残锁）
 * - 同步调度心跳超时（cron 没在跑）
 * - 引擎或向量服务不可达
 *
 * 异常 → 给所有管理员在本应用菜单（key=status）推红点；恢复 → 清除。
 * 菜单 badge_clear_on_open: true（未读语义）：管理员点开即清，若未恢复下轮再推。
 */
import { dq } from '#/lib/db'
import { usersTable } from '#/lib/conventions'
import { getStatus, type DashboardStatus } from '#/lib/status'

const SERVER = process.env.DOOTASK_SERVER || 'http://nginx'
const MENU_KEY = 'status'

type DTClient = {
  setAppBadge: (
    userid: number | Array<number>,
    options: { count?: number; dot?: boolean; menuKey?: string },
  ) => Promise<unknown>
}

export function healthIssues(status: DashboardStatus): Array<string> {
  const issues: Array<string> = []
  if (!status.engine.online) issues.push('engine_offline')
  if (!status.vectorService.reachable) issues.push('ai_unreachable')
  if (status.syncTasks.some((t) => t.stuck)) issues.push('lock_stuck')
  if (!status.cron.healthy) issues.push('cron_stale')
  if (status.failures.total > 0 && (status.failures.oldestAgeSec ?? 0) > 1800) {
    issues.push('failures_piling')
  }
  return issues
}

let lastUnhealthy: boolean | null = null

export async function runBadgeCheck(): Promise<{ issues: Array<string>; pushed: boolean }> {
  const status = await getStatus()
  const issues = healthIssues(status)
  const unhealthy = issues.length > 0

  // 异常期每轮都推（幂等，且覆盖「打开清零后仍未恢复」）；恢复只在状态翻转时清一次
  const shouldPush = unhealthy || lastUnhealthy === true
  if (!shouldPush) {
    lastUnhealthy = unhealthy
    return { issues, pushed: false }
  }

  try {
    const admins = await dq<{ userid: number }>(
      `SELECT userid FROM ${usersTable()} WHERE identity LIKE '%,admin,%' AND bot = 0 AND disable_at IS NULL LIMIT 100`,
    )
    const ids = admins.map((a) => a.userid)
    if (ids.length) {
      const mod = await import('@dootask/tools')
      const Ctor = (mod as unknown as { DooTaskClient: new (o: unknown) => DTClient })
        .DooTaskClient
      // 应用级操作：appid/secret 取容器内置环境变量 APP_ID / APP_SECRET
      const client = new Ctor({ token: '', server: SERVER, timeoutMs: 8000 })
      await client.setAppBadge(ids, unhealthy ? { dot: true, menuKey: MENU_KEY } : { count: 0, dot: false, menuKey: MENU_KEY })
    }
    lastUnhealthy = unhealthy
    return { issues, pushed: true }
  } catch (e) {
    console.error('[search-dashboard] badge push failed:', e instanceof Error ? e.message : e)
    return { issues, pushed: false }
  }
}
