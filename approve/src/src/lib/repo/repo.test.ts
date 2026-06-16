import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { closeDb, setDbForTesting } from '#/lib/db'
import { createDef, getDef, listDefs, updateDef } from '#/lib/repo/defs'
import {
  createInst,
  deleteInst,
  getInst,
  listByInitiator,
  updateInst,
} from '#/lib/repo/insts'
import {
  createTask,
  finishTask,
  getActiveTask,
  listPendingForUser,
  recordAgree,
} from '#/lib/repo/tasks'
import {
  createActor,
  listCcForUser,
  listDoneForUser,
  listPendingByTask,
  setActorAction,
} from '#/lib/repo/actors'
import { addEvent, listEventsByInst } from '#/lib/repo/events'
import { addAttachment, listAttachmentsByInst } from '#/lib/repo/attachments'
import { addMsg, deleteMsgsByInst, listMsgsByInst } from '#/lib/repo/msgs'
import {
  SETTING_KEYS,
  getBotConfig,
  getSetting,
  setSetting,
} from '#/lib/repo/settings'

// 每个测试用一个全新的内存库，互不污染。
beforeEach(() => {
  setDbForTesting(new Database(':memory:'))
})
afterEach(() => {
  closeDb()
})

describe('proc_def repo', () => {
  it('create/get/list/update + 版本递增', () => {
    const d = createDef({ name: '请假', category: 'vacate' }, 1)
    expect(d.id).toBeGreaterThan(0)
    expect(d.version).toBe(1)
    expect(getDef(d.id)?.name).toBe('请假')

    createDef({ name: '禁用模板', status: 'disabled' }, 1)
    expect(listDefs().length).toBe(2)
    expect(listDefs({ onlyEnabled: true }).length).toBe(1)

    const up = updateDef(
      d.id,
      { name: '请假V2', flow_nodes: '{"a":1}' },
      { bumpVersion: true },
    )
    expect(up?.name).toBe('请假V2')
    expect(up?.version).toBe(2)
  })
})

describe('proc_inst repo', () => {
  it('create/get/update 运行时字段 + 按发起人查询', () => {
    const def = createDef({ name: 'x' }, 1)
    const inst = createInst({
      def_id: def.id,
      def_version: 1,
      title: '我的请假',
      initiator_id: 10,
      node_sequence: '[{"nodeId":"n1","type":"approver"}]',
      cur_node_seq_idx: 0,
    })
    expect(inst.state).toBe(1)
    expect(getInst(inst.id)?.title).toBe('我的请假')

    updateInst(inst.id, {
      state: 2,
      status: 'approved',
      cur_node_seq_idx: 1,
      finished_at: '2026-01-01',
    })
    const after = getInst(inst.id)!
    expect(after.state).toBe(2)
    expect(after.cur_node_seq_idx).toBe(1)
    expect(after.finished_at).toBe('2026-01-01')

    expect(listByInitiator(10).length).toBe(1)
    expect(listByInitiator(10, { status: 'approved' }).length).toBe(1)
    expect(listByInitiator(10, { status: 'running' }).length).toBe(0)
    expect(listByInitiator(999).length).toBe(0)
  })
})

describe('proc_task repo（会签计数）', () => {
  it('recordAgree 递减 pending_count，归零即可判定通过', () => {
    const def = createDef({ name: 'x' }, 1)
    const inst = createInst({
      def_id: def.id,
      def_version: 1,
      title: 't',
      initiator_id: 1,
    })
    const task = createTask({
      inst_id: inst.id,
      node_id: 'n1',
      approve_mode: 'cosign',
      total_approvers: 2,
    })
    expect(task.pending_count).toBe(2)

    let t = recordAgree(task.id)!
    expect(t.pending_count).toBe(1)
    expect(t.agree_count).toBe(1)
    t = recordAgree(task.id)!
    expect(t.pending_count).toBe(0)
    expect(t.agree_count).toBe(2)
    // 再减不会变负
    t = recordAgree(task.id)!
    expect(t.pending_count).toBe(0)

    expect(getActiveTask(inst.id)?.id).toBe(task.id)
    finishTask(task.id, 'approved', '同意')
    expect(getActiveTask(inst.id)).toBeUndefined()
  })
})

describe('proc_actor repo', () => {
  it('待处理审批人 / 处置动作 / 抄送我', () => {
    const def = createDef({ name: 'x' }, 1)
    const inst = createInst({
      def_id: def.id,
      def_version: 1,
      title: 't',
      initiator_id: 1,
    })
    const task = createTask({
      inst_id: inst.id,
      node_id: 'n1',
      total_approvers: 2,
    })

    const a1 = createActor({
      inst_id: inst.id,
      task_id: task.id,
      userid: 5,
      role: 'approver',
    })
    createActor({
      inst_id: inst.id,
      task_id: task.id,
      userid: 6,
      role: 'approver',
    })
    createActor({ inst_id: inst.id, userid: 7, role: 'cc' })

    expect(listPendingByTask(task.id).length).toBe(2)
    setActorAction(a1.id, 'approved', 'ok')
    expect(listPendingByTask(task.id).length).toBe(1)

    expect(listCcForUser(7).length).toBe(1)
    expect(listCcForUser(5).length).toBe(0)
  })

  it('待办/已处理按 proc_actor 归类（不依赖 assignee_id，排除系统 actor）', () => {
    const def = createDef({ name: 'x' }, 1)
    // 会签节点 [3, 33]，发起人 3 已审、33 待审；assignee_id 只指向首位 3。
    const inst = createInst({
      def_id: def.id,
      def_version: 1,
      title: '请假',
      initiator_id: 3,
    })
    const task = createTask({
      inst_id: inst.id,
      node_id: 'n1',
      node_seq_idx: 1,
      approve_mode: 'cosign',
      assignee_id: 3,
      total_approvers: 2,
      pending_count: 1,
    })
    // start 节点给发起人写的系统 actor（审计用，非人工处置）。
    createActor({
      inst_id: inst.id,
      node_seq_idx: 0,
      userid: 3,
      role: 'approver',
      action: 'approved',
      is_system: 1,
    })
    const a3 = createActor({
      inst_id: inst.id,
      task_id: task.id,
      node_seq_idx: 1,
      userid: 3,
      role: 'approver',
      action: 'pending',
    })
    createActor({
      inst_id: inst.id,
      task_id: task.id,
      node_seq_idx: 1,
      userid: 33,
      role: 'approver',
      action: 'pending',
    })
    setActorAction(a3.id, 'approved', 'ok') // 3 人工同意

    // #16：会签第二审批人 33 即便非 assignee 也应出现在待处理。
    expect(listPendingForUser(33).map((t) => t.inst_id)).toContain(inst.id)
    // 已审过的 3 不在待处理，且因人工处置进入已处理。
    expect(listPendingForUser(3)).toHaveLength(0)
    expect(listDoneForUser(3).map((a) => a.inst_id)).toContain(inst.id)
    // 33 尚未处置，不在已处理。
    expect(listDoneForUser(33)).toHaveLength(0)
  })

  it('发起人 start 系统 actor 不应进入其已处理（#17）', () => {
    const def = createDef({ name: 'x' }, 1)
    const inst = createInst({
      def_id: def.id,
      def_version: 1,
      title: '请假',
      initiator_id: 33,
    })
    const task = createTask({
      inst_id: inst.id,
      node_id: 'n1',
      node_seq_idx: 1,
      approve_mode: 'cosign',
      assignee_id: 3,
      total_approvers: 2,
      pending_count: 2,
    })
    createActor({
      inst_id: inst.id,
      node_seq_idx: 0,
      userid: 33,
      role: 'approver',
      action: 'approved',
      is_system: 1,
    })
    createActor({
      inst_id: inst.id,
      task_id: task.id,
      node_seq_idx: 1,
      userid: 33,
      role: 'approver',
      action: 'pending',
    })
    // 发起人 33 仅有 start 系统 actor 与一条 pending，不应出现在已处理。
    expect(listDoneForUser(33)).toHaveLength(0)
    // 但作为会签待审人应出现在待处理。
    expect(listPendingForUser(33).map((t) => t.inst_id)).toContain(inst.id)
  })

  it('加签人（role=addsign）计入待办人，可被处置/通知', () => {
    const def = createDef({ name: 'x' }, 1)
    const inst = createInst({
      def_id: def.id,
      def_version: 1,
      title: 't',
      initiator_id: 1,
    })
    const task = createTask({
      inst_id: inst.id,
      node_id: 'n1',
      total_approvers: 2,
    })
    createActor({
      inst_id: inst.id,
      task_id: task.id,
      userid: 5,
      role: 'approver',
    })
    createActor({
      inst_id: inst.id,
      task_id: task.id,
      userid: 9,
      role: 'addsign',
    })
    const pending = listPendingByTask(task.id).map((a) => a.userid)
    expect(pending).toContain(5)
    expect(pending).toContain(9)
    expect(listPendingForUser(9).map((t) => t.inst_id)).toContain(inst.id)
  })
})

describe('proc_event / attachment / msg repo', () => {
  it('时间线追加并按序读取', () => {
    const def = createDef({ name: 'x' }, 1)
    const inst = createInst({
      def_id: def.id,
      def_version: 1,
      title: 't',
      initiator_id: 1,
    })
    addEvent({ inst_id: inst.id, actor_id: 1, action: 'submit' })
    addEvent({
      inst_id: inst.id,
      actor_id: 5,
      action: 'approve',
      remark: '同意',
    })
    const evs = listEventsByInst(inst.id)
    expect(evs.length).toBe(2)
    expect(evs[0].action).toBe('submit')
  })

  it('附件增查', () => {
    const def = createDef({ name: 'x' }, 1)
    const inst = createInst({
      def_id: def.id,
      def_version: 1,
      title: 't',
      initiator_id: 1,
    })
    addAttachment({
      inst_id: inst.id,
      field_key: 'files',
      file_id: 99,
      name: 'a.pdf',
      uploaded_by: 1,
    })
    const list = listAttachmentsByInst(inst.id)
    expect(list.length).toBe(1)
    expect(list[0].file_id).toBe(99)
  })

  it('待办消息映射增查与回收', () => {
    const def = createDef({ name: 'x' }, 1)
    const inst = createInst({
      def_id: def.id,
      def_version: 1,
      title: 't',
      initiator_id: 1,
    })
    addMsg({
      inst_id: inst.id,
      userid: 5,
      dialog_id: 100,
      msg_id: 200,
      kind: 'reviewer',
    })
    addMsg({ inst_id: inst.id, userid: 7, kind: 'cc' })
    expect(listMsgsByInst(inst.id).length).toBe(2)
    expect(deleteMsgsByInst(inst.id, 'cc')).toBe(1)
    expect(listMsgsByInst(inst.id).length).toBe(1)
    expect(deleteMsgsByInst(inst.id)).toBe(1)
    expect(listMsgsByInst(inst.id).length).toBe(0)
  })
})

describe('sys_settings repo', () => {
  it('upsert / 读取 / 删除 / 机器人配置', () => {
    expect(getSetting('nope')).toBeNull()
    setSetting(SETTING_KEYS.botToken, 'tok')
    setSetting(SETTING_KEYS.botUserId, '42')
    setSetting(SETTING_KEYS.botName, '审批机器人')
    setSetting(SETTING_KEYS.botToken, 'tok2') // upsert
    const bot = getBotConfig()
    expect(bot.token).toBe('tok2')
    expect(bot.userid).toBe(42)
    expect(bot.name).toBe('审批机器人')
    setSetting(SETTING_KEYS.botToken, null)
    expect(getSetting(SETTING_KEYS.botToken)).toBeNull()
  })
})

describe('级联删除（外键开启）', () => {
  it('删实例应级联删除其 task/actor/event/attachment', () => {
    const def = createDef({ name: 'x' }, 1)
    const inst = createInst({
      def_id: def.id,
      def_version: 1,
      title: 't',
      initiator_id: 1,
    })
    const task = createTask({
      inst_id: inst.id,
      node_id: 'n1',
      total_approvers: 1,
    })
    createActor({
      inst_id: inst.id,
      task_id: task.id,
      userid: 5,
      role: 'approver',
    })
    addEvent({ inst_id: inst.id, actor_id: 1, action: 'submit' })
    addAttachment({ inst_id: inst.id, uploaded_by: 1, name: 'a' })

    // 删实例触发 ON DELETE CASCADE
    expect(deleteInst(inst.id)).toBe(true)
    expect(getActiveTask(inst.id)).toBeUndefined()
    expect(listEventsByInst(inst.id).length).toBe(0)
    expect(listAttachmentsByInst(inst.id).length).toBe(0)
  })
})
