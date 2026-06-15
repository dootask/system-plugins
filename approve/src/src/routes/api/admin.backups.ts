import { createFileRoute } from '@tanstack/react-router'
import {
  createBackupHandler,
  listBackupsHandler,
} from '#/lib/handlers/backups'

// GET  /apps/approve/api/admin/backups → 备份列表（管理员）。
// POST /apps/approve/api/admin/backups → 立即备份（管理员）。
export const Route = createFileRoute('/api/admin/backups')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => listBackupsHandler(request),
      POST: ({ request }: { request: Request }) => createBackupHandler(request),
    },
  },
})
