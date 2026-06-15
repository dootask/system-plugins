import { createFileRoute } from '@tanstack/react-router'
import { BackupView } from '#/components/views/backup-view'

// 数据备份（管理员）。/admin/backup；后端 API 亦做管理员鉴权。
export const Route = createFileRoute('/admin/backup')({ component: BackupView })
