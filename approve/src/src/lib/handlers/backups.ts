/**
 * 数据备份 HTTP handler（管理员）。所有操作均先反查身份并校验管理员。
 * 路由：
 * - GET    /api/admin/backups        列表
 * - POST   /api/admin/backups        立即备份
 * - GET    /api/admin/backups/:name  下载
 * - POST   /api/admin/backups/:name  还原
 * - DELETE /api/admin/backups/:name  删除
 */
import { readFileSync } from 'node:fs'
import { created, forbidden, notFound, ok, requireUser } from '#/lib/auth'
import {
  createBackup,
  deleteBackup,
  listBackups,
  resolveBackupPath,
  restoreBackup,
} from '#/lib/backup'

async function requireAdmin(request: Request): Promise<Response | null> {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  if (!auth.isAdmin) return forbidden('仅管理员可操作')
  return null
}

function nameFromUrl(request: Request): string {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean)
  return decodeURIComponent(parts[parts.length - 1] || '')
}

export async function listBackupsHandler(request: Request): Promise<Response> {
  const denied = await requireAdmin(request)
  if (denied) return denied
  return ok({ items: listBackups() })
}

export async function createBackupHandler(request: Request): Promise<Response> {
  const denied = await requireAdmin(request)
  if (denied) return denied
  return created(await createBackup())
}

export async function downloadBackupHandler(
  request: Request,
): Promise<Response> {
  const denied = await requireAdmin(request)
  if (denied) return denied
  const name = nameFromUrl(request)
  const full = resolveBackupPath(name)
  if (!full) return notFound('备份不存在')
  const buf = readFileSync(full)
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': name.endsWith('.zip')
        ? 'application/zip'
        : 'application/octet-stream',
      'content-disposition': `attachment; filename="${name}"`,
      'content-length': String(buf.length),
    },
  })
}

export async function restoreBackupHandler(
  request: Request,
): Promise<Response> {
  const denied = await requireAdmin(request)
  if (denied) return denied
  if (!restoreBackup(nameFromUrl(request))) return notFound('备份不存在')
  return ok({ restored: true })
}

export async function deleteBackupHandler(request: Request): Promise<Response> {
  const denied = await requireAdmin(request)
  if (denied) return denied
  if (!deleteBackup(nameFromUrl(request))) return notFound('备份不存在')
  return ok({ deleted: true })
}
