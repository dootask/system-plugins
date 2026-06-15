/**
 * 附件上传/读取 handler（handler 层）。
 * - POST /api/uploads：前端 multipart（字段 file）→ 用 x-user-token 经 DooTaskClient 调
 *   主程序 /api/file/content/upload 拿 file_id → 回前端 { fileId, name, size, ext }。
 *   附件入库（proc_attachment）发生在发起/重提时（formData 里 file 字段携带这些值）。
 * - GET  /api/uploads/:id：经 /api/file/one 取文件元信息与 content_url，供查看/下载。
 */
import { badRequest, ok, requireUser } from '#/lib/auth'
import { getFileOne, uploadFile } from '#/lib/dootask-server'

/** POST /api/uploads → 上传单个文件，返回 { fileId, name, size, ext }。 */
export async function uploadHandler(request: Request): Promise<Response> {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return badRequest('请用 multipart/form-data 上传')
  }
  const file = form.get('file')
  if (!(file instanceof File)) return badRequest('缺少文件字段 file')

  const token = request.headers.get('x-user-token')
  try {
    const buffer = await file.arrayBuffer()
    const uploaded = await uploadFile(token, {
      buffer,
      name: file.name,
      type: file.type,
    })
    return ok({
      fileId: uploaded.id,
      name: uploaded.name,
      size: uploaded.size,
      ext: uploaded.ext,
    })
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : '上传失败')
  }
}

/** GET /api/uploads/:id → 取文件元信息（含 content_url），供前端查看/下载。 */
export async function getUploadHandler(
  request: Request,
  fileId: number,
): Promise<Response> {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const token = request.headers.get('x-user-token')
  const info = await getFileOne(fileId, token)
  if (!info) return badRequest('文件不存在或无权访问')
  return ok(info)
}
