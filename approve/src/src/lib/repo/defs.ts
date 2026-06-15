import { getDb } from '#/lib/db'
import type { ProcDefRow } from '#/lib/types'

// 流程定义(模板)数据访问：CRUD + 启用列表 + 复制时的版本递增。

export interface ProcDefInput {
  name: string
  category?: string
  icon?: string | null
  form_schema?: string
  flow_nodes?: string
  start_scope?: string | null
  status?: string
  sort_order?: number
}

export function listDefs(
  opts: { onlyEnabled?: boolean } = {},
): Array<ProcDefRow> {
  const where = opts.onlyEnabled ? `WHERE status = 'enabled'` : ''
  return getDb()
    .prepare(`SELECT * FROM proc_def ${where} ORDER BY sort_order ASC, id ASC`)
    .all() as Array<ProcDefRow>
}

export function getDef(id: number): ProcDefRow | undefined {
  return getDb().prepare('SELECT * FROM proc_def WHERE id = ?').get(id) as
    | ProcDefRow
    | undefined
}

export function createDef(input: ProcDefInput, createdBy: number): ProcDefRow {
  const info = getDb()
    .prepare(
      `INSERT INTO proc_def
         (name, category, icon, form_schema, flow_nodes, start_scope, status, sort_order, created_by)
       VALUES
         (@name, @category, @icon, @form_schema, @flow_nodes, @start_scope, @status, @sort_order, @created_by)`,
    )
    .run({
      name: input.name,
      category: input.category ?? 'custom',
      icon: input.icon ?? null,
      form_schema: input.form_schema ?? '[]',
      flow_nodes: input.flow_nodes ?? '{}',
      start_scope: input.start_scope ?? null,
      status: input.status ?? 'enabled',
      sort_order: input.sort_order ?? 0,
      created_by: createdBy,
    })
  return getDef(info.lastInsertRowid as number)!
}

const PATCHABLE = [
  'name',
  'category',
  'icon',
  'form_schema',
  'flow_nodes',
  'start_scope',
  'status',
  'sort_order',
] as const

export function updateDef(
  id: number,
  patch: Partial<ProcDefInput>,
  // 改流程/表单时是否递增版本（已有运行实例引用旧版，不能原地改坏）。
  opts: { bumpVersion?: boolean } = {},
): ProcDefRow | undefined {
  const sets: Array<string> = []
  const params: Array<unknown> = []
  for (const key of PATCHABLE) {
    const v = (patch as Record<string, unknown>)[key]
    if (v !== undefined) {
      sets.push(`${key} = ?`)
      params.push(v)
    }
  }
  if (opts.bumpVersion) sets.push('version = version + 1')
  if (sets.length) {
    sets.push(`updated_at = datetime('now')`)
    params.push(id)
    getDb()
      .prepare(`UPDATE proc_def SET ${sets.join(', ')} WHERE id = ?`)
      .run(...params)
  }
  return getDef(id)
}

export function deleteDef(id: number): boolean {
  return (
    getDb().prepare('DELETE FROM proc_def WHERE id = ?').run(id).changes > 0
  )
}
