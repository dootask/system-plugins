import { getDb } from '#/lib/db'
import type { ProcAttachmentRow } from '#/lib/types'

// 附件数据访问：增删 + 按实例/字段读取。引用主程序 File id（优先）或自存路径（备选）。

export interface ProcAttachmentInput {
  inst_id: number
  field_key?: string | null
  file_id?: number | null
  local_path?: string | null
  url?: string | null
  name?: string | null
  size?: number | null
  ext?: string | null
  mime?: string | null
  uploaded_by: number
}

export function addAttachment(input: ProcAttachmentInput): ProcAttachmentRow {
  const info = getDb()
    .prepare(
      `INSERT INTO proc_attachment
         (inst_id, field_key, file_id, local_path, url, name, size, ext, mime, uploaded_by)
       VALUES
         (@inst_id, @field_key, @file_id, @local_path, @url, @name, @size, @ext, @mime, @uploaded_by)`,
    )
    .run({
      inst_id: input.inst_id,
      field_key: input.field_key ?? null,
      file_id: input.file_id ?? null,
      local_path: input.local_path ?? null,
      url: input.url ?? null,
      name: input.name ?? null,
      size: input.size ?? null,
      ext: input.ext ?? null,
      mime: input.mime ?? null,
      uploaded_by: input.uploaded_by,
    })
  return getDb()
    .prepare('SELECT * FROM proc_attachment WHERE id = ?')
    .get(info.lastInsertRowid) as ProcAttachmentRow
}

export function listAttachmentsByInst(
  instId: number,
): Array<ProcAttachmentRow> {
  return getDb()
    .prepare('SELECT * FROM proc_attachment WHERE inst_id = ? ORDER BY id ASC')
    .all(instId) as Array<ProcAttachmentRow>
}

export function deleteAttachment(id: number): boolean {
  return (
    getDb().prepare('DELETE FROM proc_attachment WHERE id = ?').run(id)
      .changes > 0
  )
}
