import { getDb } from '#/lib/db'
import type { ProcMsgRow } from '#/lib/types'

// 待办-消息映射数据访问：记录发给某人的待办消息（dialog/msg id），撤回时按此回收。

export interface ProcMsgInput {
  inst_id: number
  task_id?: number | null
  userid: number
  dialog_id?: number | null
  msg_id?: number | null
  kind: string // reviewer/cc/result/comment
}

export function addMsg(input: ProcMsgInput): ProcMsgRow {
  const info = getDb()
    .prepare(
      `INSERT INTO proc_msg (inst_id, task_id, userid, dialog_id, msg_id, kind)
       VALUES (@inst_id, @task_id, @userid, @dialog_id, @msg_id, @kind)`,
    )
    .run({
      inst_id: input.inst_id,
      task_id: input.task_id ?? null,
      userid: input.userid,
      dialog_id: input.dialog_id ?? null,
      msg_id: input.msg_id ?? null,
      kind: input.kind,
    })
  return getDb()
    .prepare('SELECT * FROM proc_msg WHERE id = ?')
    .get(info.lastInsertRowid) as ProcMsgRow
}

export function listMsgsByInst(instId: number): Array<ProcMsgRow> {
  return getDb()
    .prepare('SELECT * FROM proc_msg WHERE inst_id = ? ORDER BY id ASC')
    .all(instId) as Array<ProcMsgRow>
}

/** 撤回/结案时回收：删除该实例（可限 kind）相关的消息映射。 */
export function deleteMsgsByInst(instId: number, kind?: string): number {
  if (kind) {
    return getDb()
      .prepare('DELETE FROM proc_msg WHERE inst_id = ? AND kind = ?')
      .run(instId, kind).changes
  }
  return getDb().prepare('DELETE FROM proc_msg WHERE inst_id = ?').run(instId)
    .changes
}
