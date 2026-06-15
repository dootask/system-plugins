import { createFileRoute } from '@tanstack/react-router'
import {
  deleteBackupHandler,
  downloadBackupHandler,
  restoreBackupHandler,
} from '#/lib/handlers/backups'

// GET    /apps/approve/api/admin/backups/:name → 下载（管理员）。
// POST   /apps/approve/api/admin/backups/:name → 还原（管理员）。
// DELETE /apps/approve/api/admin/backups/:name → 删除（管理员）。
export const Route = createFileRoute('/api/admin/backups/$name')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => downloadBackupHandler(request),
      POST: ({ request }: { request: Request }) =>
        restoreBackupHandler(request),
      DELETE: ({ request }: { request: Request }) =>
        deleteBackupHandler(request),
    },
  },
})
