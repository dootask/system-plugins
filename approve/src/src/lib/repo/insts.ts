import { getDb } from '#/lib/db'
import type { ProcInstRow } from '#/lib/types'

// 流程实例数据访问：CRUD + 运行时字段更新（state/指针/序列）+ 列表查询。
// 运行时字段（state/node_sequence/cur_node_seq_idx）由引擎写入，repo 只提供原子读写。

export interface ProcInstInput {
  def_id: number
  def_version: number
  title: string
  form_data?: string
  initiator_id: number
  dept_id?: number | null
  status?: string
  state?: number
  node_sequence?: string
  cur_node_seq_idx?: number
  cur_node_id?: string | null
}

export function getInst(id: number): ProcInstRow | undefined {
  return getDb().prepare('SELECT * FROM proc_inst WHERE id = ?').get(id) as
    | ProcInstRow
    | undefined
}

export function createInst(input: ProcInstInput): ProcInstRow {
  const info = getDb()
    .prepare(
      `INSERT INTO proc_inst
         (def_id, def_version, title, form_data, initiator_id, dept_id, status,
          state, node_sequence, cur_node_seq_idx, cur_node_id)
       VALUES
         (@def_id, @def_version, @title, @form_data, @initiator_id, @dept_id, @status,
          @state, @node_sequence, @cur_node_seq_idx, @cur_node_id)`,
    )
    .run({
      def_id: input.def_id,
      def_version: input.def_version,
      title: input.title,
      form_data: input.form_data ?? '{}',
      initiator_id: input.initiator_id,
      dept_id: input.dept_id ?? null,
      status: input.status ?? 'running',
      state: input.state ?? 1,
      node_sequence: input.node_sequence ?? '[]',
      cur_node_seq_idx: input.cur_node_seq_idx ?? 0,
      cur_node_id: input.cur_node_id ?? null,
    })
  return getInst(info.lastInsertRowid as number)!
}

const PATCHABLE = [
  'title',
  'form_data',
  'status',
  'state',
  'node_sequence',
  'cur_node_seq_idx',
  'cur_node_id',
] as const

export function updateInst(
  id: number,
  patch: Partial<ProcInstInput> & { finished_at?: string | null },
): ProcInstRow | undefined {
  const sets: Array<string> = []
  const params: Array<unknown> = []
  for (const key of PATCHABLE) {
    const v = (patch as Record<string, unknown>)[key]
    if (v !== undefined) {
      sets.push(`${key} = ?`)
      params.push(v)
    }
  }
  if (patch.finished_at !== undefined) {
    sets.push('finished_at = ?')
    params.push(patch.finished_at)
  }
  if (sets.length) {
    sets.push(`updated_at = datetime('now')`)
    params.push(id)
    getDb()
      .prepare(`UPDATE proc_inst SET ${sets.join(', ')} WHERE id = ?`)
      .run(...params)
  }
  return getInst(id)
}

/** 我发起的（按状态可筛）。 */
export function listByInitiator(
  initiatorId: number,
  filter: { status?: string } = {},
): Array<ProcInstRow> {
  const where = ['initiator_id = ?']
  const params: Array<unknown> = [initiatorId]
  if (filter.status) {
    where.push('status = ?')
    params.push(filter.status)
  }
  return getDb()
    .prepare(
      `SELECT * FROM proc_inst WHERE ${where.join(' AND ')} ORDER BY id DESC`,
    )
    .all(...params) as Array<ProcInstRow>
}

export function deleteInst(id: number): boolean {
  return (
    getDb().prepare('DELETE FROM proc_inst WHERE id = ?').run(id).changes > 0
  )
}

/**
 * 按状态汇总实例数量。
 * - scope='all'（管理员）：全部实例。
 * - scope='mine'：仅 initiatorId 发起的实例。
 */
export function countByStatus(
  scope: 'all' | 'mine',
  initiatorId?: number,
): Record<string, number> {
  const rows = (
    scope === 'mine'
      ? getDb()
          .prepare(
            `SELECT status, COUNT(*) AS c FROM proc_inst WHERE initiator_id = ? GROUP BY status`,
          )
          .all(initiatorId)
      : getDb()
          .prepare(
            `SELECT status, COUNT(*) AS c FROM proc_inst GROUP BY status`,
          )
          .all()
  ) as Array<{ status: string; c: number }>
  const out: Record<string, number> = {}
  for (const r of rows) out[r.status] = r.c
  return out
}
