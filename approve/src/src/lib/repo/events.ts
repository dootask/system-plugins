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

/** 某实例的「末次处置」（处理人 + 意见）：取最后一条决断性事件。 */
export interface LastDecision {
  actor_id: number
  action: string
  remark: string | null
}

/**
 * 批量取各实例的末次处置事件（approve/reject/return/withdraw/archive 中 id 最大者）。
 * 一次扫描决断性事件，按 inst_id 归并（后出现的覆盖前者）→ Map<inst_id, LastDecision>。
 * 导出用：避免逐单查询。
 */
export function lastDecisionByInst(): Map<number, LastDecision> {
  const rows = getDb()
    .prepare(
      `SELECT inst_id, actor_id, action, remark FROM proc_event
         WHERE action IN ('approve','reject','return','withdraw','archive')
         ORDER BY id ASC`,
    )
    .all() as Array<{
    inst_id: number
    actor_id: number
    action: string
    remark: string | null
  }>
  const out = new Map<number, LastDecision>()
  for (const r of rows)
    out.set(r.inst_id, {
      actor_id: r.actor_id,
      action: r.action,
      remark: r.remark,
    })
  return out
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
