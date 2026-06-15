import { getDb } from '#/lib/db'
import type { CommentImage, ProcEventRow } from '#/lib/types'

// 操作流水/时间线数据访问：追加 + 按实例读取（详情页时间线）。
// attachments 在库里以 JSON 文本列存储，读出时解析为 CommentImage[]。

export interface ProcEventInput {
  inst_id: number
  task_id?: number | null
  actor_id: number
  action: string // submit/approve/reject/return/withdraw/transfer/addsign/comment/archive
  remark?: string | null
  /** 评论/意见附带的图片。 */
  attachments?: Array<CommentImage> | null
}

/** 数据库原始行（attachments 为 JSON 文本）。 */
interface RawEventRow extends Omit<ProcEventRow, 'attachments'> {
  attachments: string | null
}

function parseAttachments(raw: string | null): Array<CommentImage> | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Array<CommentImage>
    return Array.isArray(v) && v.length > 0 ? v : null
  } catch {
    return null
  }
}

function toEvent(row: RawEventRow): ProcEventRow {
  return { ...row, attachments: parseAttachments(row.attachments) }
}

export function addEvent(input: ProcEventInput): ProcEventRow {
  const atts =
    input.attachments && input.attachments.length > 0
      ? JSON.stringify(input.attachments)
      : null
  const info = getDb()
    .prepare(
      `INSERT INTO proc_event (inst_id, task_id, actor_id, action, remark, attachments)
       VALUES (@inst_id, @task_id, @actor_id, @action, @remark, @attachments)`,
    )
    .run({
      inst_id: input.inst_id,
      task_id: input.task_id ?? null,
      actor_id: input.actor_id,
      action: input.action,
      remark: input.remark ?? null,
      attachments: atts,
    })
  const row = getDb()
    .prepare('SELECT * FROM proc_event WHERE id = ?')
    .get(info.lastInsertRowid) as RawEventRow
  return toEvent(row)
}

/** 时间线（按时间正序）。 */
export function listEventsByInst(instId: number): Array<ProcEventRow> {
  const rows = getDb()
    .prepare(
      'SELECT * FROM proc_event WHERE inst_id = ? ORDER BY created_at ASC, id ASC',
    )
    .all(instId) as Array<RawEventRow>
  return rows.map(toEvent)
}
