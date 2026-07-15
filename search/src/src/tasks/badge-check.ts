import { defineTask } from 'nitro/task'
import { runBadgeCheck } from '#/lib/badge'

// 搜索健康巡检。由 vite.config 的 scheduledTasks 每 5 分钟触发；
// 生产为 node-server 长驻进程，Nitro 的 croner 调度器会在启动时拉起。
export default defineTask({
  meta: {
    name: 'search:badge-check',
    description: '检查失败堆积/锁卡死/服务异常，异常时给管理员菜单推红点',
  },
  async run() {
    const result = await runBadgeCheck()
    if (result.issues.length) {
      console.log('[search-dashboard] badge-check issues:', result.issues.join(','))
    }
    return { result }
  },
})
