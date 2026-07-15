import { createFileRoute } from '@tanstack/react-router'
import { adminHandler, ok } from '#/lib/auth'
import { redis } from '#/lib/db'
import {
  CHECKTIME_REDIS_KEY,
  SYNC_COMMANDS,
  lockRedisKey,
} from '#/lib/conventions'

// POST /apps/search/api/locks/clear → 清理同步残锁 + 调度节流标记
// 用途：同步进程被杀（容器重启/部署）后留下的 30 分钟残锁会让同步停摆，
// 清掉后下一轮 cron（1 分钟内）即恢复。对运行中的健康进程无影响面评估——
// 前端只在「疑似卡死」时展示该操作，且清锁后健康进程的下一次 setLock 会自动重建锁。
export const Route = createFileRoute('/api/locks/clear')({
  server: {
    handlers: {
      POST: adminHandler(async ({ user }) => {
        const r = redis()
        const keys = SYNC_COMMANDS.map((c) => lockRedisKey(c.signature))
        const cleared = await r.del(...keys, CHECKTIME_REDIS_KEY)
        console.log(`[search-dashboard] locks cleared by admin ${user.userid}: ${cleared} keys`)
        return ok({ cleared })
      }),
    },
  },
})
