import { getDb } from '#/lib/db'
import type { ProcTaskRow } from '#/lib/types'

// 审批任务数据访问：CRUD + 会签计数原子递减 + 待我审批查询。

export interface ProcTaskInput {
  inst_id: number
  node_id: string
  node_seq_idx?: number
  node_name?: string | null
  approve_mode?: string
  assignee_id?: number | null
  total_approvers?: number
  pending_count?: number
  due_at?: string | null
}

export function getTask(id: number): ProcTaskRow | undefined {
  return getDb().prepare('SELECT * FROM proc_task WHERE id = ?').get(id) as
    | ProcTaskRow
    | undefined
}

export function createTask(input: ProcTaskInput): ProcTaskRow {
  const total = input.total_approvers ?? 0
  const info = getDb()
    .prepare(
      `INSERT INTO proc_task
         (inst_id, node_id, node_seq_idx, node_name, approve_mode, assignee_id,
          total_approvers, pending_count, due_at)
       VALUES
         (@inst_id, @node_id, @node_seq_idx, @node_name, @approve_mode, @assignee_id,
          @total_approvers, @pending_count, @due_at)`,
    )
    .run({
      inst_id: input.inst_id,
      node_id: input.node_id,
      node_seq_idx: input.node_seq_idx ?? 0,
      node_name: input.node_name ?? null,
      approve_mode: input.approve_mode ?? 'or',
      assignee_id: input.assignee_id ?? null,
      total_approvers: total,
      pending_count: input.pending_count ?? total,
      due_at: input.due_at ?? null,
    })
  return getTask(info.lastInsertRowid as number)!
}

/** 当前实例最新（未结束）的任务。 */
export function getActiveTask(instId: number): ProcTaskRow | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM proc_task WHERE inst_id = ? AND is_finished = 0
         ORDER BY node_seq_idx DESC, id DESC LIMIT 1`,
    )
    .get(instId) as ProcTaskRow | undefined
}

export function listTasksByInst(instId: number): Array<ProcTaskRow> {
  return getDb()
    .prepare('SELECT * FROM proc_task WHERE inst_id = ? ORDER BY id ASC')
    .all(instId) as Array<ProcTaskRow>
}

/**
 * 记一次同意：pending_count--、agree_count++（不低于 0），返回更新后的行。
 * 会签判定（pending_count==0）由调用方（引擎）据返回值决定是否推进。
 */
export function recordAgree(taskId: number): ProcTaskRow | undefined {
  getDb()
    .prepare(
      `UPDATE proc_task
         SET pending_count = MAX(pending_count - 1, 0), agree_count = agree_count + 1
       WHERE id = ?`,
    )
    .run(taskId)
  return getTask(taskId)
}

/** 结束任务并置最终状态（approved/rejected/transferred/skipped）。 */
export function finishTask(
  taskId: number,
  state: string,
  comment?: string | null,
) {
  getDb()
    .prepare(
      `UPDATE proc_task
         SET is_finished = 1, state = ?, comment = COALESCE(?, comment),
             acted_at = datetime('now')
       WHERE id = ?`,
    )
    .run(state, comment ?? null, taskId)
}

/** 待我审批：assignee_id = 我 且 pending。 */
export function listPendingForUser(userid: number): Array<ProcTaskRow> {
  return getDb()
    .prepare(
      `SELECT * FROM proc_task WHERE assignee_id = ? AND state = 'pending'
         ORDER BY id DESC`,
    )
    .all(userid) as Array<ProcTaskRow>
}
