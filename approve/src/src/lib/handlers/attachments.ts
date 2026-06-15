/**
 * 附件服务（handler 层）：把表单里 file 字段的已上传文件落 proc_attachment（审计/汇总）。
 *
 * 附件存于插件本地（见 lib/uploads.ts），库内/表单值只存访问 URL。展示直接走该 URL，
 * 无需再向主程序解析；也不再把附件共享进聊天（本地文件不在主程序文件库）。
 */
import { addAttachment, listAttachmentsByInst } from '#/lib/repo/attachments'
import type { FieldDef, FileValue, FormSchema } from '#/lib/form/types'

/** 表单里所有 file 字段已带 url 的附件值（含字段 key）。 */
function collectUploaded(
  schema: FormSchema,
  formData: Record<string, unknown>,
): Array<{ field: FieldDef; file: FileValue }> {
  const out: Array<{ field: FieldDef; file: FileValue }> = []
  for (const field of schema) {
    if (field.type !== 'file') continue
    const v = formData[field.key]
    if (!Array.isArray(v)) continue
    for (const item of v as Array<FileValue>) {
      if (typeof item.url === 'string' && item.url) {
        out.push({ field, file: item })
      }
    }
  }
  return out
}

/**
 * 落库该实例 file 字段的已上传附件。重入安全：按 url 去重，已存在则跳过
 * （发起只调一次；重提时再调也不会重复落库）。
 */
export function persistAttachments(
  instId: number,
  schema: FormSchema,
  formData: Record<string, unknown>,
  uploadedBy: number,
): void {
  const uploaded = collectUploaded(schema, formData)
  if (uploaded.length === 0) return
  const existing = new Set(
    listAttachmentsByInst(instId)
      .map((a) => a.url)
      .filter((x): x is string => !!x),
  )
  for (const { field, file } of uploaded) {
    if (existing.has(file.url)) continue
    addAttachment({
      inst_id: instId,
      field_key: field.key,
      url: file.url,
      name: file.name,
      size: file.size ?? null,
      mime: file.mime ?? null,
      uploaded_by: uploadedBy,
    })
  }
}
