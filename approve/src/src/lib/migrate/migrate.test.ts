import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { closeDb, setDbForTesting } from '#/lib/db'
import { advanceSnapshot } from '#/lib/engine'
import type { RuntimeSnapshot } from '#/lib/engine'
import type { NodeInfo } from '#/lib/engine/types'
import { alreadyMigrated, runMigration } from './migrate'
import {
  convertNodeInfos,
  convertResourceToFlow,
  identityToActor,
  inferCategoryAndSchema,
} from './transform'
import type {
  LegacyExecution,
  LegacyIdentitylink,
  LegacyProcInst,
  LegacyProcdef,
  LegacySource,
  LegacyTask,
} from './legacy-types'

// ───────────────────────── 内存假数据源 ─────────────────────────

interface FakeData {
  procdefs: Array<LegacyProcdef>
  insts: Array<LegacyProcInst>
  executions: Array<LegacyExecution>
  tasks: Array<LegacyTask>
  identitylinks: Array<LegacyIdentitylink>
}

function makeSource(data: FakeData): LegacySource {
  return {
    async procdefs() {
      return data.procdefs
    },
    async procInsts() {
      return data.insts
    },
    async executionByInst(id) {
      return data.executions.find((e) => e.proc_inst_id === id)
    },
    async tasksByInst(id) {
      return data.tasks.filter((t) => t.proc_inst_id === id)
    },
    async identitylinksByInst(id) {
      return data.identitylinks.filter((il) => il.proc_inst_id === id)
    },
    async close() {},
  }
}

// 旧引擎默认模板：start → approver(管理员=1,会签 and) → notifier(抄送=1) → end。
const RESOURCE_VACATE = JSON.stringify({
  name: '发起人',
  type: 'start',
  nodeId: 'sid-startevent',
  childNode: {
    name: '审核人',
    type: 'approver',
    nodeId: 'A1',
    settype: 1,
    examineMode: 1,
    nodeUserList: [{ name: '管理员', targetId: '1', type: 1 }],
    childNode: {
      name: '抄送人',
      type: 'notifier',
      nodeId: 'N1',
      nodeUserList: [{ name: '管理员', targetId: '1', type: 1 }],
      childNode: { ccSelfSelectFlag: 0 },
    },
  },
})

// 展开后的旧线性节点（execution.node_infos）。审批人=用户2（非发起人，会产生待办）。
function nodeInfos(approverId: string): string {
  return JSON.stringify([
    {
      nodeId: '0',
      type: 'starter',
      aproverType: 'start',
      memberCount: 0,
      level: 0,
      actType: '',
    },
    {
      nodeId: 'A1',
      type: 'approver',
      settype: 1,
      aproverId: approverId,
      aproverType: 'approver',
      memberCount: 1,
      level: 1,
      actType: 'and',
    },
    {
      nodeId: 'N1',
      type: 'notifier',
      aproverId: '1',
      aproverType: 'notifier',
      memberCount: 1,
      level: 1,
      actType: 'or',
    },
    {
      nodeId: '1',
      type: '',
      aproverType: 'end',
      memberCount: 0,
      level: 0,
      actType: '',
    },
  ])
}

beforeEach(() => {
  setDbForTesting(new Database(':memory:'))
})
afterEach(() => {
  closeDb()
})

// ───────────────────────── 纯转换单测 ─────────────────────────

describe('transform: procdef → flow + schema', () => {
  it('请假流程树转 FlowNode（start→approver(cosign)→notifier）', () => {
    const flow = convertResourceToFlow(RESOURCE_VACATE)
    expect(flow?.type).toBe('start')
    const ap = flow?.childNode
    expect(ap?.type).toBe('approver')
    expect(ap?.settype).toBe('specific')
    expect(ap?.approveMode).toBe('cosign') // examineMode=1 → 会签
    expect(ap?.userIds).toEqual([1])
    expect(ap?.childNode?.type).toBe('notifier')
  })

  it('请假/加班/自定义 form_schema 推断', () => {
    expect(inferCategoryAndSchema('请假').category).toBe('vacate')
    expect(
      inferCategoryAndSchema('请假').schema.some((f) => f.key === 'type'),
    ).toBe(true)
    expect(inferCategoryAndSchema('加班').category).toBe('overtime')
    expect(
      inferCategoryAndSchema('加班').schema.some((f) => f.key === 'type'),
    ).toBe(false)
    expect(inferCategoryAndSchema('录用申请').category).toBe('custom')
    // 通用 schema 仍含 description/other，能容纳旧 Var。
    expect(inferCategoryAndSchema('录用申请').schema.map((f) => f.key)).toEqual(
      ['description', 'other'],
    )
  })
})

describe('transform: node_infos → NodeInfo[]', () => {
  it('丢弃末尾 end，starter→start(isSystem)，notifier→isSystem', () => {
    const seq = convertNodeInfos(nodeInfos('2'))
    expect(seq.map((n) => n.type)).toEqual(['start', 'approver', 'notifier'])
    expect(seq[0].isSystem).toBe(true)
    expect(seq[1].isSystem).toBe(false)
    expect(seq[1].approverIds).toEqual([2])
    expect(seq[1].approveMode).toBe('cosign') // actType and
    expect(seq[2].isSystem).toBe(true)
  })
})

describe('transform: identitylink → actor', () => {
  it('notifier→cc/is_system，candidate state 映射', () => {
    expect(
      identityToActor({ type: 'notifier', state: 0, is_system: 0 }),
    ).toEqual({
      role: 'cc',
      action: 'pending',
      is_system: 1,
    })
    expect(
      identityToActor({ type: 'candidate', state: 1, is_system: 0 }).action,
    ).toBe('approved')
    expect(
      identityToActor({ type: 'participant', state: 2, is_system: 0 }).action,
    ).toBe('rejected')
    expect(
      identityToActor({ type: 'candidate', state: 3, is_system: 0 }).action,
    ).toBe('withdrawn')
  })
})

// ───────────────────────── 编排：procdef + 实例映射 ─────────────────────────

function baseInst(over: Partial<LegacyProcInst>): LegacyProcInst {
  return {
    id: 0,
    proc_def_id: 1,
    proc_def_name: '请假',
    title: '请假申请',
    department_id: 10,
    department: '研发',
    company: 'c',
    node_id: 'A1',
    candidate: '',
    task_id: 0,
    start_time: '2024-01-01 09:00:00',
    end_time: '',
    duration: 0,
    start_user_id: '5',
    start_user_name: '小明',
    is_finished: 0,
    var: '{"type":"年假","startTime":"2024-01-02","endTime":"2024-01-03","description":"休息","other":""}',
    state: 1,
    latest_comment: '',
    global_comment: '',
    ...over,
  }
}

describe('runMigration', () => {
  it('procdef → proc_def 一对一', () => {
    const db = new Database(':memory:')
    setDbForTesting(db)
    const data: FakeData = {
      procdefs: [
        {
          id: 1,
          name: '请假',
          version: 1,
          resource: RESOURCE_VACATE,
          userid: '1',
          username: 'a',
          company: 'c',
          deploy_time: '2023-11-20 09:38:48',
          created_time: '2023-11-20 09:38:48',
        },
        {
          id: 3,
          name: '加班',
          version: 2,
          resource: RESOURCE_VACATE,
          userid: '1',
          username: 'a',
          company: 'c',
          deploy_time: '',
          created_time: '',
        },
      ],
      insts: [],
      executions: [],
      tasks: [],
      identitylinks: [],
    }
    return runMigration(makeSource(data), db).then((r) => {
      expect(r.defs).toBe(2)
      const defs = db
        .prepare('SELECT * FROM proc_def ORDER BY id')
        .all() as Array<{
        name: string
        category: string
        version: number
        flow_nodes: string
        form_schema: string
      }>
      expect(defs[0].name).toBe('请假')
      expect(defs[0].category).toBe('vacate')
      expect(defs[1].category).toBe('overtime')
      expect(defs[1].version).toBe(2)
      expect(JSON.parse(defs[0].flow_nodes).type).toBe('start')
      expect(JSON.parse(defs[0].form_schema).length).toBeGreaterThan(0)
    })
  })

  it('已结束实例(state=2 通过) → 历史 + 时间线', async () => {
    const db = new Database(':memory:')
    setDbForTesting(db)
    const data: FakeData = {
      procdefs: [
        {
          id: 1,
          name: '请假',
          version: 1,
          resource: RESOURCE_VACATE,
          userid: '1',
          username: 'a',
          company: 'c',
          deploy_time: '',
          created_time: '',
        },
      ],
      insts: [
        baseInst({
          id: 100,
          state: 2,
          is_finished: 1,
          end_time: '2024-01-01 10:00:00',
        }),
      ],
      executions: [
        {
          id: 1,
          proc_inst_id: 100,
          proc_def_id: 1,
          node_infos: nodeInfos('2'),
          is_active: 0,
          start_time: '2024-01-01 09:00:00',
        },
      ],
      tasks: [
        {
          id: 1,
          node_id: '0',
          step: 0,
          proc_inst_id: 100,
          assignee: '5',
          create_time: '2024-01-01 09:00:00',
          claim_time: '2024-01-01 09:00:00',
          member_count: 1,
          un_complete_num: 0,
          agree_num: 1,
          act_type: 'or',
          is_finished: 1,
        },
        {
          id: 2,
          node_id: 'A1',
          step: 1,
          proc_inst_id: 100,
          assignee: '2',
          create_time: '2024-01-01 09:00:00',
          claim_time: '2024-01-01 09:30:00',
          member_count: 1,
          un_complete_num: 0,
          agree_num: 1,
          act_type: 'and',
          is_finished: 1,
        },
      ],
      identitylinks: [
        {
          id: 1,
          group: '',
          type: 'participant',
          user_id: '2',
          user_name: 'b',
          task_id: 2,
          step: 1,
          proc_inst_id: 100,
          company: 'c',
          comment: '同意',
          is_system: 0,
          state: 1,
        },
        {
          id: 2,
          group: '',
          type: 'notifier',
          user_id: '1',
          user_name: 'a',
          task_id: 0,
          step: 1,
          proc_inst_id: 100,
          company: 'c',
          comment: '',
          is_system: 0,
          state: 0,
        },
      ],
    }
    const r = await runMigration(makeSource(data), db)
    expect(r.instsFinished).toBe(1)
    expect(r.instsRunning).toBe(0)

    const inst = db.prepare('SELECT * FROM proc_inst WHERE id = 1').get() as {
      status: string
      state: number
      cur_node_seq_idx: number
      finished_at: string
      form_data: string
    }
    expect(inst.status).toBe('approved')
    expect(inst.state).toBe(2)
    // node_sequence 长度 3（start/approver/notifier），已结束指针落到末尾。
    expect(inst.cur_node_seq_idx).toBe(3)
    expect(inst.finished_at).toBe('2024-01-01 10:00:00')
    expect(JSON.parse(inst.form_data).type).toBe('年假')

    // task：starter(step0) 跳过，只建 approver task；为已结束 approved。
    const tasks = db
      .prepare('SELECT * FROM proc_task WHERE inst_id = 1')
      .all() as Array<{
      node_id: string
      is_finished: number
      state: string
    }>
    expect(tasks.length).toBe(1)
    expect(tasks[0].state).toBe('approved')

    // actor：participant→approver(approved)，notifier→cc(system)。
    const actors = db
      .prepare('SELECT * FROM proc_actor WHERE inst_id = 1 ORDER BY id')
      .all() as Array<{
      role: string
      action: string
      is_system: number
    }>
    expect(actors.map((a) => a.role)).toEqual(['approver', 'cc'])
    expect(actors[0].action).toBe('approved')
    expect(actors[1].is_system).toBe(1)

    // 时间线：submit + approve（notifier state0 无事件）。
    const events = db
      .prepare('SELECT action FROM proc_event WHERE inst_id = 1 ORDER BY id')
      .all() as Array<{ action: string }>
    expect(events.map((e) => e.action)).toEqual(['submit', 'approve'])
  })

  it('进行中实例(state=1) → 无缝续跑，新引擎可推进', async () => {
    const db = new Database(':memory:')
    setDbForTesting(db)
    const data: FakeData = {
      procdefs: [
        {
          id: 1,
          name: '请假',
          version: 1,
          resource: RESOURCE_VACATE,
          userid: '1',
          username: 'a',
          company: 'c',
          deploy_time: '',
          created_time: '',
        },
      ],
      insts: [baseInst({ id: 200, state: 1, is_finished: 0 })],
      executions: [
        {
          id: 1,
          proc_inst_id: 200,
          proc_def_id: 1,
          node_infos: nodeInfos('2'),
          is_active: 1,
          start_time: '2024-01-01 09:00:00',
        },
      ],
      tasks: [
        {
          id: 1,
          node_id: '0',
          step: 0,
          proc_inst_id: 200,
          assignee: '5',
          create_time: '2024-01-01 09:00:00',
          claim_time: '2024-01-01 09:00:00',
          member_count: 1,
          un_complete_num: 0,
          agree_num: 1,
          act_type: 'or',
          is_finished: 1,
        },
        // 当前 approver 节点（step=1）未完成，待审 1 人。
        {
          id: 2,
          node_id: 'A1',
          step: 1,
          proc_inst_id: 200,
          assignee: '2',
          create_time: '2024-01-01 09:00:00',
          claim_time: '',
          member_count: 1,
          un_complete_num: 1,
          agree_num: 0,
          act_type: 'and',
          is_finished: 0,
        },
      ],
      identitylinks: [
        {
          id: 1,
          group: '管理员',
          type: 'candidate',
          user_id: '2',
          user_name: 'b',
          task_id: 2,
          step: 1,
          proc_inst_id: 200,
          company: 'c',
          comment: '',
          is_system: 0,
          state: 0,
        },
      ],
    }
    const r = await runMigration(makeSource(data), db)
    expect(r.instsRunning).toBe(1)

    const inst = db.prepare('SELECT * FROM proc_inst WHERE id = 1').get() as {
      status: string
      state: number
      cur_node_seq_idx: number
      cur_node_id: string
      node_sequence: string
    }
    expect(inst.status).toBe('running')
    expect(inst.state).toBe(1)
    expect(inst.cur_node_seq_idx).toBe(1) // 停在 approver 节点
    expect(inst.cur_node_id).toBe('A1')

    const task = db
      .prepare('SELECT * FROM proc_task WHERE inst_id = 1 AND is_finished = 0')
      .get() as {
      pending_count: number
      total_approvers: number
      approve_mode: string
    }
    expect(task.pending_count).toBe(1)
    expect(task.total_approvers).toBe(1)
    expect(task.approve_mode).toBe('cosign')

    // ── 影子推进验证：构造快照，approve 后应到末尾、state=2 ──
    const seq = JSON.parse(inst.node_sequence) as Array<NodeInfo>
    const snap: RuntimeSnapshot = {
      nodeSequence: seq,
      curNodeSeqIdx: inst.cur_node_seq_idx,
      state: inst.state,
      task: {
        nodeSeqIdx: 1,
        totalApprovers: task.total_approvers,
        pendingCount: task.pending_count,
        agreeCount: 0,
        isFinished: false,
        rejected: false,
      },
      actors: [
        { nodeSeqIdx: 1, actorId: 2, action: 'pending', isSystem: false },
      ],
      initiatorId: 5,
    }
    const after = advanceSnapshot(snap, { actorId: 2, action: 'approve' })
    // approver 后是 notifier(isSystem) → 跳过 → 到末尾 → 通过。
    expect(after.curNodeSeqIdx).toBe(seq.length)
    expect(after.state).toBe(2)
    expect(after.actors[0].action).toBe('approved')
  })

  it('进行中实例 reject → 影子推进 state=3', async () => {
    const seq = convertNodeInfos(nodeInfos('2'))
    const snap: RuntimeSnapshot = {
      nodeSequence: seq,
      curNodeSeqIdx: 1,
      state: 1,
      task: {
        nodeSeqIdx: 1,
        totalApprovers: 1,
        pendingCount: 1,
        agreeCount: 0,
        isFinished: false,
        rejected: false,
      },
      actors: [
        { nodeSeqIdx: 1, actorId: 2, action: 'pending', isSystem: false },
      ],
      initiatorId: 5,
    }
    const after = advanceSnapshot(snap, { actorId: 2, action: 'reject' })
    expect(after.state).toBe(3)
    expect(after.curNodeSeqIdx).toBe(1) // 拒绝停在本节点
    expect(after.actors[0].action).toBe('rejected')
  })

  it('幂等：已迁则跳过；force 可重跑', async () => {
    const db = new Database(':memory:')
    setDbForTesting(db)
    const data: FakeData = {
      procdefs: [
        {
          id: 1,
          name: '请假',
          version: 1,
          resource: RESOURCE_VACATE,
          userid: '1',
          username: 'a',
          company: 'c',
          deploy_time: '',
          created_time: '',
        },
      ],
      insts: [],
      executions: [],
      tasks: [],
      identitylinks: [],
    }
    const src = makeSource(data)
    const r1 = await runMigration(src, db)
    expect(r1.migrated).toBe(true)
    expect(alreadyMigrated(db)).toBe(true)

    // 第二次：默认跳过（不重复写 def）。
    const r2 = await runMigration(src, db)
    expect(r2.migrated).toBe(false)
    expect(r2.reason).toBe('already-migrated')
    expect(
      (db.prepare('SELECT COUNT(*) c FROM proc_def').get() as { c: number }).c,
    ).toBe(1)

    // force：重跑会再写一遍（管理员手动重置场景）。
    const r3 = await runMigration(src, db, true)
    expect(r3.migrated).toBe(true)
    expect(
      (db.prepare('SELECT COUNT(*) c FROM proc_def').get() as { c: number }).c,
    ).toBe(2)
  })
})
