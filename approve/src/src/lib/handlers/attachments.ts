/**
 * 附件服务（handler 层）：把表单里 file 字段的已上传文件落 proc_attachment，
 * 并用 FileUser（主程序 /api/file/share/update）把附件共享给当前参与人。
 *
 * 链路：前端经 POST /api/uploads 上传 → 主程序返回 file_id → 前端把 {fileId,name,...}
 * 填进 file 字段值 → 发起/重提时此处把这些 fileId 落库；参与人随流转变化，故在发起与
 * 每次推进后调 syncAttachmentShares 增量共享给「当前所有参与人」（含历史，幂等覆盖）。
 */
import { addAttachment, listAttachmentsByInst } from '#/lib/repo/attachments'
import { listActorsByInst } from '#/lib/repo/actors'
import { getInst } from '#/lib/repo/insts'
import { getFileOne, shareFilesToUsers } from '#/lib/dootask-server'
import type { FieldDef, FileValue, FormSchema } from '#/lib/form/types'
import type { CommentImage } from '#/lib/types'

/** 表单里所有 file 字段已带 fileId 的附件值（含字段 key）。 */
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
      if (Number.isFinite(item.fileId) && (item.fileId as number) > 0) {
        out.push({ field, file: item })
      }
    }
  }
  return out
}

/**
 * 落库该实例 file 字段的已上传附件。重入安全：发起只调一次；重提时先清空再重建，
 * 避免重复（这里按 fileId 去重，已存在则跳过）。
 */
export async function persistAttachments(
  instId: number,
  schema: FormSchema,
  formData: Record<string, unknown>,
  uploadedBy: number,
  _token: string | null,
): Promise<void> {
  const uploaded = collectUploaded(schema, formData)
  if (uploaded.length === 0) return
  const existing = new Set(
    listAttachmentsByInst(instId)
      .map((a) => a.file_id)
      .filter((x): x is number => x != null),
  )
  for (const { field, file } of uploaded) {
    if (existing.has(file.fileId as number)) continue
    addAttachment({
      inst_id: instId,
      field_key: field.key,
      file_id: file.fileId ?? null,
      name: file.name,
      size: file.size ?? null,
      ext: file.ext ?? null,
      uploaded_by: uploadedBy,
    })
  }
}

/**
 * 把该实例的全部附件共享给「当前所有参与人」（发起人 + 审批人 + 抄送人 + 加签人）。
 * 参与人随流转新增，故每次推进后调一次（permission=0 只读，幂等覆盖）。
 * 共享用机器人 token（上传时操作人=发起人，机器人需有权；失败仅记日志，不阻断）。
 */
export async function syncAttachmentShares(
  instId: number,
  token: string | null,
): Promise<void> {
  const atts = listAttachmentsByInst(instId)
  const fileIds = atts
    .map((a) => a.file_id)
    .filter((x): x is number => x != null)
  if (fileIds.length === 0) return
  const inst = getInst(instId)
  if (!inst) return
  const userids = new Set<number>([inst.initiator_id])
  for (const a of listActorsByInst(instId)) userids.add(a.userid)
  await shareFilesToUsers(fileIds, [...userids], token)
}

/**
 * 处理评论/审批意见附带的图片：解析主程序内容直链（content_url）并共享给当前参与人，
 * 返回可直接入库（proc_event.attachments）的 CommentImage[]。
 * url 解析失败仅退化为无 url（前端展示文件名），不抛错。
 */
export async function resolveCommentImages(
  instId: number,
  images: Array<FileValue> | undefined,
  token: string | null,
): Promise<Array<CommentImage>> {
  const valid = (images ?? []).filter(
    (f): f is FileValue & { fileId: number } =>
      Number.isFinite(f.fileId) && (f.fileId as number) > 0,
  )
  if (valid.length === 0) return []

  const resolved = await Promise.all(
    valid.map(async (f): Promise<CommentImage> => {
      const info = await getFileOne(f.fileId, token)
      return {
        fileId: f.fileId,
        name: f.name,
        ext: f.ext ?? info?.ext,
        size: f.size,
        url: info?.content_url,
      }
    }),
  )

  // 共享给当前参与人（发起人 + 审批/抄送/加签人），便于查看；失败仅记日志。
  const inst = getInst(instId)
  if (inst) {
    const userids = new Set<number>([inst.initiator_id])
    for (const a of listActorsByInst(instId)) userids.add(a.userid)
    await shareFilesToUsers(
      valid.map((f) => f.fileId),
      [...userids],
      token,
    )
  }
  return resolved
}
