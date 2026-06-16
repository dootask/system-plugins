import { createFileRoute } from '@tanstack/react-router'
import { exportInstsHandler } from '#/lib/handlers/export'

// 审批数据导出（仅管理员）。
// GET /apps/approve/api/admin/export?from=&to=&statuses=a,b&defId=&keyword=  → XLSX 二进制
// GET 同路径 &count=1                                                        → { total, limit }
export const Route = createFileRoute('/api/admin/export')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => exportInstsHandler(request),
    },
  },
})
