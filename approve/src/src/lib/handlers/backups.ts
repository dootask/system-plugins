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
  importBackup,
  resolveBackupPath,
  restoreBackup,
} from '#/lib/backup'
import { serverT } from '#/lib/i18n/server'
import { BackupError, MAX_BACKUP_UPLOAD_BYTES } from '#/lib/backup-validation'

async function requireAdmin(request: Request): Promise<Response | null> {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  if (!auth.isAdmin) return forbidden(serverT(request)('server.err.adminOnly'))
  return null
}

async function operation(
  request: Request,
  run: () => Response | Promise<Response>,
): Promise<Response> {
  const denied = await requireAdmin(request)
  if (denied) return denied
  try {
    return await run()
  } catch (error) {
    if (error instanceof BackupError) {
      return Response.json(
        { error: serverT(request)(error.key) },
        { status: error.status },
      )
    }
    console.error('[approve] backup operation failed', error)
    return Response.json(
      { error: serverT(request)('backup.operationFailed') },
      { status: 500 },
    )
  }
}

function nameFromUrl(request: Request): string {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean)
  return decodeURIComponent(parts[parts.length - 1] || '')
}

export async function listBackupsHandler(request: Request): Promise<Response> {
  const denied = await requireAdmin(request)
  if (denied) return denied
  return ok({ items: listBackups(), maxUploadBytes: MAX_BACKUP_UPLOAD_BYTES })
}

export async function createBackupHandler(request: Request): Promise<Response> {
  return operation(request, async () => created(await createBackup()))
}

/** PUT /api/admin/backups?name=filename：原始文件流，避免 multipart 全量缓冲。 */
export async function importBackupHandler(request: Request): Promise<Response> {
  return operation(request, async () => {
    const length = Number(request.headers.get('content-length'))
    if (length > MAX_BACKUP_UPLOAD_BYTES)
      throw new BackupError('backup.uploadTooLarge', 413)
    const name = new URL(request.url).searchParams.get('name') ?? ''
    return created(await importBackup(name, request.body))
  })
}

export async function downloadBackupHandler(
  request: Request,
): Promise<Response> {
  const denied = await requireAdmin(request)
  if (denied) return denied
  const name = nameFromUrl(request)
  const full = resolveBackupPath(name)
  if (!full) return notFound(serverT(request)('server.err.backupNotFound'))
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
  return operation(request, async () => {
    const result = await restoreBackup(nameFromUrl(request))
    if (!result) return notFound(serverT(request)('server.err.backupNotFound'))
    return ok({ restored: true, ...result })
  })
}

export async function deleteBackupHandler(request: Request): Promise<Response> {
  return operation(request, () => {
    if (!deleteBackup(nameFromUrl(request)))
      return notFound(serverT(request)('server.err.backupNotFound'))
    return ok({ deleted: true })
  })
}
