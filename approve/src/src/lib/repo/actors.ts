import { getDb } from '#/lib/db'
import type { ProcActorRow } from '#/lib/types'

// 参与人/抄送/加签数据访问：CRUD + 按节点/动作查询 + 处置动作更新。

export interface ProcActorInput {
  inst_id: number
  task_id?: number | null
  node_seq_idx?: number
  userid: number
  role: string // approver/cc/addsign
  action?: string
  is_system?: number
}

export function createActor(input: ProcActorInput): ProcActorRow {
  const info = getDb()
    .prepare(
      `INSERT INTO proc_actor
         (inst_id, task_id, node_seq_idx, userid, role, action, is_system)
       VALUES
         (@inst_id, @task_id, @node_seq_idx, @userid, @role, @action, @is_system)`,
    )
    .run({
      inst_id: input.inst_id,
      task_id: input.task_id ?? null,
      node_seq_idx: input.node_seq_idx ?? 0,
      userid: input.userid,
      role: input.role,
      action: input.action ?? 'pending',
      is_system: input.is_system ?? 0,
    })
  return getActor(info.lastInsertRowid as number)!
}

export function getActor(id: number): ProcActorRow | undefined {
  return getDb().prepare('SELECT * FROM proc_actor WHERE id = ?').get(id) as
    | ProcActorRow
    | undefined
}

export function listActorsByInst(instId: number): Array<ProcActorRow> {
  return getDb()
    .prepare('SELECT * FROM proc_actor WHERE inst_id = ? ORDER BY id ASC')
    .all(instId) as Array<ProcActorRow>
}

/** 某任务/节点下仍待处理的审批人/加签人（pending）。加签人 role='addsign' 同样要能处置。 */
export function listPendingByTask(taskId: number): Array<ProcActorRow> {
  return getDb()
    .prepare(
      `SELECT * FROM proc_actor
         WHERE task_id = ? AND role IN ('approver', 'addsign') AND action = 'pending'
         ORDER BY id ASC`,
    )
    .all(taskId) as Array<ProcActorRow>
}

/** 记录某参与人的处置动作（approved/rejected/withdrawn）。 */
export function setActorAction(
  id: number,
  action: string,
  comment?: string | null,
) {
  getDb()
    .prepare(
      `UPDATE proc_actor SET action = ?, comment = COALESCE(?, comment) WHERE id = ?`,
    )
    .run(action, comment ?? null, id)
}

/** 抄送我的：role=cc 且 userid=我。 */
export function listCcForUser(userid: number): Array<ProcActorRow> {
  return getDb()
    .prepare(
      `SELECT * FROM proc_actor WHERE userid = ? AND role = 'cc' ORDER BY id DESC`,
    )
    .all(userid) as Array<ProcActorRow>
}

/**
 * 已处理：我作为审批人且**人工**处置过（action 非 pending）。
 * 排除 is_system=1 的系统记录——发起时给发起人写的 start actor、以及自审/已审过的
 * 自动通过记录都是系统生成、并非我点过审批，否则会把"我发起的单"误并进我的已处理。
 */
export function listDoneForUser(userid: number): Array<ProcActorRow> {
  return getDb()
    .prepare(
      `SELECT * FROM proc_actor
         WHERE userid = ? AND role = 'approver'
           AND action != 'pending' AND is_system = 0
         ORDER BY id DESC`,
    )
    .all(userid) as Array<ProcActorRow>
}
