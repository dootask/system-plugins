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

/** 导出筛选（管理员全量导出用）。空字段=不限。 */
export interface ExportFilter {
  /** 发起日期下限（YYYY-MM-DD，含当日 00:00:00）。 */
  from?: string
  /** 发起日期上限（YYYY-MM-DD，含当日 23:59:59）。 */
  to?: string
  /** 状态白名单（running/approved/rejected/withdrawn/archived/draft）。 */
  statuses?: Array<string>
  /** 指定模板（仅导该模板，并据其 schema 展开表单字段列）。 */
  defId?: number
  /** 标题模糊匹配。 */
  keyword?: string
  /** 行数上限（防一次导超量）。 */
  limit?: number
}

/** 全量实例导出查询：按筛选返回实例行（按 id 倒序，受 limit 限制）。 */
export function listForExport(f: ExportFilter): Array<ProcInstRow> {
  const where: Array<string> = []
  const params: Array<unknown> = []
  if (f.from) {
    where.push('created_at >= ?')
    params.push(`${f.from} 00:00:00`)
  }
  if (f.to) {
    where.push('created_at <= ?')
    params.push(`${f.to} 23:59:59`)
  }
  if (f.statuses && f.statuses.length > 0) {
    where.push(`status IN (${f.statuses.map(() => '?').join(', ')})`)
    params.push(...f.statuses)
  }
  if (f.defId) {
    where.push('def_id = ?')
    params.push(f.defId)
  }
  if (f.keyword) {
    where.push('title LIKE ?')
    params.push(`%${f.keyword}%`)
  }
  const limit = f.limit && f.limit > 0 ? Math.min(f.limit, 50000) : 10000
  const sql = `SELECT * FROM proc_inst${
    where.length ? ` WHERE ${where.join(' AND ')}` : ''
  } ORDER BY id DESC LIMIT ${limit}`
  return getDb().prepare(sql).all(...params) as Array<ProcInstRow>
}

/** 统计某筛选下的实例总数（用于「是否被 limit 截断」提示）。 */
export function countForExport(f: ExportFilter): number {
  const where: Array<string> = []
  const params: Array<unknown> = []
  if (f.from) {
    where.push('created_at >= ?')
    params.push(`${f.from} 00:00:00`)
  }
  if (f.to) {
    where.push('created_at <= ?')
    params.push(`${f.to} 23:59:59`)
  }
  if (f.statuses && f.statuses.length > 0) {
    where.push(`status IN (${f.statuses.map(() => '?').join(', ')})`)
    params.push(...f.statuses)
  }
  if (f.defId) {
    where.push('def_id = ?')
    params.push(f.defId)
  }
  if (f.keyword) {
    where.push('title LIKE ?')
    params.push(`%${f.keyword}%`)
  }
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM proc_inst${
        where.length ? ` WHERE ${where.join(' AND ')}` : ''
      }`,
    )
    .get(...params) as { c: number }
  return row.c
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
