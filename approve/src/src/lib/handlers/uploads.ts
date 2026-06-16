/**
 * 附件上传/读取 handler（插件本地存储，参考 crm）。
 * - POST /api/uploads：前端 multipart（字段 file）→ saveUpload 落盘 → 回 { name, url, size, mime }。
 * - GET  /api/uploads/:name：内联查看（位图 <img>）或下载（?download&name=原名）。
 *   读取不强制鉴权：文件名为不可枚举的 UUID，且 <img> 无法携带身份头。
 */
import { existsSync, readFileSync } from 'node:fs'
import { badRequest, created, notFound, requireUser } from '#/lib/auth'
import {
  MAX_UPLOAD_BYTES,
  resolveUploadPath,
  saveUpload,
  sniffImageType,
} from '#/lib/uploads'
import { serverT } from '#/lib/i18n/server'

/** POST /api/uploads → 上传单个文件，返回 { name, url, size, mime }。 */
export async function uploadHandler(request: Request): Promise<Response> {
  const t = serverT(request)
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return badRequest(t('server.err.useMultipart'))
  }
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return badRequest(t('server.err.missingFileField'))
  }
  if (file.size > MAX_UPLOAD_BYTES) return badRequest(t('server.err.fileTooLarge'))
  return created(await saveUpload(file))
}

/** GET /api/uploads/:name → 回文件字节（位图内联，其余按附件下载）。 */
export function serveUploadHandler(request: Request, name: string): Response {
  const t = serverT(request)
  const full = resolveUploadPath(name)
  if (!full || !existsSync(full)) return notFound(t('server.err.fileNotFound'))
  const buf = readFileSync(full)
  const imageType = sniffImageType(buf)
  const headers: Record<string, string> = {
    'content-type': imageType || 'application/octet-stream',
    'content-length': String(buf.length),
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  }
  const sp = new URL(request.url).searchParams
  // 非图片（或显式 ?download）一律作为附件下载，用回传的原文件名。
  if (sp.has('download') || !imageType) {
    const fname = sp.get('name') || name
    headers['content-disposition'] =
      `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`
  }
  return new Response(new Uint8Array(buf), { headers })
}
