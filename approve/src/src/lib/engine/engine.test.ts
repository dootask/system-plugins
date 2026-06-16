import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { closeDb, setDbForTesting } from '#/lib/db'
import { createDef } from '#/lib/repo/defs'
import { getInst } from '#/lib/repo/insts'
import { getActiveTask, listTasksByInst } from '#/lib/repo/tasks'
import { listActorsByInst, listPendingByTask } from '#/lib/repo/actors'
import { listEventsByInst } from '#/lib/repo/events'
import { createEngine } from './engine'
import type { FlowNode } from './flow'
import { advanceSnapshot } from './shadow'
import type { RuntimeSnapshot } from './shadow'
import { InstState } from './types'

beforeEach(() => setDbForTesting(new Database(':memory:')))
afterEach(() => closeDb())

const engine = () => createEngine()

/** 建一个流程定义并返回 defId。 */
function def(flow: FlowNode): number {
  const d = createDef({ name: 't', flow_nodes: JSON.stringify(flow) }, 1)
  return d.id
}

/** 单审批节点（指定成员）。 */
function approver(
  nodeId: string,
  ids: Array<number>,
  mode: 'or' | 'cosign' | 'sequence',
  child?: FlowNode,
): FlowNode {
  return {
    nodeId,
    type: 'approver',
    settype: 'specific',
    approveMode: mode,
    userIds: ids,
    childNode: child,
  }
}

describe('start 展开 + 首节点落地', () => {
  it('单人审批：建实例、首 task、pending actor', () => {
    const id = engine().start(
      def(approver('a', [20], 'or')),
      {},
      { userId: 10 },
    )
    const inst = getInst(id)!
    expect(inst.state).toBe(InstState.running)
    const task = getActiveTask(id)!
    expect(task.node_id).toBe('a')
    expect(listPendingByTask(task.id).map((a) => a.userid)).toEqual([20])
    // start 写了系统 submit 事件
    expect(listEventsByInst(id).some((e) => e.action === 'submit')).toBe(true)
  })
})

describe('或签 (or)', () => {
  it('首人通过即过节点', () => {
    const id = engine().start(
      def(approver('a', [20, 21], 'or')),
      {},
      { userId: 10 },
    )
    engine().act(id, 20, 'approve')
    const inst = getInst(id)!
    expect(inst.state).toBe(InstState.approved)
  })
})

describe('会签 (cosign)', () => {
  it('需全员通过；一票拒绝立即终止', () => {
    const id = engine().start(
      def(approver('a', [20, 21], 'cosign')),
      {},
      { userId: 10 },
    )
    engine().act(id, 20, 'approve')
    expect(getInst(id)!.state).toBe(InstState.running) // 还差一人
    engine().act(id, 21, 'approve')
    expect(getInst(id)!.state).toBe(InstState.approved)
  })

  it('会签中一票拒绝整单 rejected', () => {
    const id = engine().start(
      def(approver('a', [20, 21], 'cosign')),
      {},
      { userId: 10 },
    )
    engine().act(id, 20, 'reject', { comment: '不行' })
    expect(getInst(id)!.state).toBe(InstState.rejected)
  })
})

describe('依次 (sequence)', () => {
  it('按 approverIds 顺序逐个待办', () => {
    const id = engine().start(
      def(approver('a', [20, 21, 22], 'sequence')),
      {},
      { userId: 10 },
    )
    const t = getActiveTask(id)!
    // 起始仅第一人 pending
    expect(listPendingByTask(t.id).map((a) => a.userid)).toEqual([20])
    engine().act(id, 20, 'approve')
    expect(listPendingByTask(t.id).map((a) => a.userid)).toEqual([21])
    engine().act(id, 21, 'approve')
    expect(listPendingByTask(t.id).map((a) => a.userid)).toEqual([22])
    engine().act(id, 22, 'approve')
    expect(getInst(id)!.state).toBe(InstState.approved)
  })

  it('非当前轮次的人无法抢审', () => {
    const id = engine().start(
      def(approver('a', [20, 21], 'sequence')),
      {},
      { userId: 10 },
    )
    expect(() => engine().act(id, 21, 'approve')).toThrow()
  })
})

describe('多节点串联', () => {
  it('节点逐个推进至结束', () => {
    const flow = approver('a', [20], 'or', approver('b', [21], 'or'))
    const id = engine().start(def(flow), {}, { userId: 10 })
    expect(getActiveTask(id)!.node_id).toBe('a')
    engine().act(id, 20, 'approve')
    expect(getActiveTask(id)!.node_id).toBe('b')
    engine().act(id, 21, 'approve')
    expect(getInst(id)!.state).toBe(InstState.approved)
  })
})

describe('条件分支 (route)', () => {
  function routed(): FlowNode {
    return {
      nodeId: 'start',
      type: 'start',
      childNode: {
        nodeId: 'r',
        type: 'route',
        conditionNodes: [
          {
            nodeId: 'big',
            conditions: [{ field: 'amount', op: 'gte', value: 1000 }],
            childNode: approver('boss', [30], 'or'),
          },
          {
            nodeId: 'small',
            conditions: [],
            childNode: approver('lead', [21], 'or'),
          }, // 兜底
        ],
      },
    }
  }
  it('amount>=1000 走 boss 分支', () => {
    const id = engine().start(def(routed()), { amount: 2000 }, { userId: 10 })
    expect(getActiveTask(id)!.node_id).toBe('boss')
  })
  it('amount<1000 走兜底 lead 分支', () => {
    const id = engine().start(def(routed()), { amount: 50 }, { userId: 10 })
    expect(getActiveTask(id)!.node_id).toBe('lead')
  })
})

describe('抄送跳过 (notifier)', () => {
  it('抄送节点自动建已完成 cc actor，不产生待办', () => {
    const flow = approver('a', [20], 'or', {
      nodeId: 'cc',
      type: 'notifier',
      settype: 'specific',
      userIds: [40, 41],
      childNode: approver('b', [21], 'or'),
    })
    const id = engine().start(def(flow), {}, { userId: 10 })
    engine().act(id, 20, 'approve')
    // 抄送被跳过，直接到 b
    expect(getActiveTask(id)!.node_id).toBe('b')
    const ccs = listActorsByInst(id).filter((a) => a.role === 'cc')
    expect(ccs.map((a) => a.userid).sort()).toEqual([40, 41])
    expect(ccs.every((a) => a.is_system === 1 && a.action === 'approved')).toBe(
      true,
    )
  })
})

describe('自审跳过', () => {
  it('审批人==发起人 自动通过', () => {
    const flow = approver('self', [10], 'or', approver('b', [21], 'or'))
    const id = engine().start(def(flow), {}, { userId: 10 })
    // self 节点审批人就是发起人 → 自动跳过，落到 b
    expect(getActiveTask(id)!.node_id).toBe('b')
    const sysActor = listActorsByInst(id).find(
      (a) => a.node_seq_idx === 1 && a.is_system === 1,
    )
    expect(sysActor?.userid).toBe(10)
  })

  it('前序已审过的人 自动通过', () => {
    const flow = approver(
      'a',
      [20],
      'or',
      approver('b', [20], 'or', approver('c', [21], 'or')),
    )
    const id = engine().start(def(flow), {}, { userId: 10 })
    engine().act(id, 20, 'approve') // 过 a；b 审批人也是 20 → 自动跳过 → 落 c
    expect(getActiveTask(id)!.node_id).toBe('c')
  })
})

describe('驳回 (reject)', () => {
  it('不可逆终止，state=3', () => {
    const id = engine().start(
      def(approver('a', [20], 'or', approver('b', [21], 'or'))),
      {},
      { userId: 10 },
    )
    engine().act(id, 20, 'reject')
    const inst = getInst(id)!
    expect(inst.state).toBe(InstState.rejected)
    expect(inst.status).toBe('rejected')
    expect(getActiveTask(id)).toBeUndefined()
  })
})

describe('退回 (return) + 重新提交', () => {
  it('退回到发起人(state=0)，区别于 reject；resubmit 续审', () => {
    const id = engine().start(
      def(approver('a', [20], 'or', approver('b', [21], 'or'))),
      {},
      { userId: 10 },
    )
    engine().act(id, 20, 'return', { comment: '补材料' })
    expect(getInst(id)!.state).toBe(InstState.pending)
    expect(getInst(id)!.cur_node_seq_idx).toBe(0)
    // 重新提交 → 从头续审，落回 a
    engine().resubmit(id, { note: 'done' })
    expect(getInst(id)!.state).toBe(InstState.running)
    expect(getActiveTask(id)!.node_id).toBe('a')
  })
})

describe('撤回 (withdraw)', () => {
  it('无人审过时本人可撤回，state=4', () => {
    const id = engine().start(
      def(approver('a', [20], 'or')),
      {},
      { userId: 10 },
    )
    engine().act(id, 10, 'withdraw')
    expect(getInst(id)!.state).toBe(InstState.withdrawn)
  })
  it('非发起人不可撤回', () => {
    const id = engine().start(
      def(approver('a', [20], 'or')),
      {},
      { userId: 10 },
    )
    expect(() => engine().act(id, 20, 'withdraw')).toThrow()
  })
  it('已有人审过的会签节点不可撤回', () => {
    const id = engine().start(
      def(approver('a', [20, 21], 'cosign')),
      {},
      { userId: 10 },
    )
    engine().act(id, 20, 'approve')
    expect(() => engine().act(id, 10, 'withdraw')).toThrow()
  })
})

describe('转交 (transfer) / 加签 (addsign)', () => {
  it('transfer 换审批人', () => {
    const id = engine().start(
      def(approver('a', [20], 'or')),
      {},
      { userId: 10 },
    )
    const t = getActiveTask(id)!
    engine().act(id, 20, 'transfer', { transferTo: 99 })
    expect(listPendingByTask(t.id).map((a) => a.userid)).toEqual([99])
    engine().act(id, 99, 'approve')
    expect(getInst(id)!.state).toBe(InstState.approved)
  })
  it('addsign 会签人数+1', () => {
    const id = engine().start(
      def(approver('a', [20, 21], 'cosign')),
      {},
      { userId: 10 },
    )
    const t = getActiveTask(id)!
    expect(t.total_approvers).toBe(2)
    engine().act(id, 20, 'addsign', { addsignTo: [22] })
    const t2 = getActiveTask(id)!
    expect(t2.total_approvers).toBe(3)
    expect(t2.pending_count).toBe(3)
  })
  it('加签的人可处置并参与会签结算', () => {
    const id = engine().start(
      def(approver('a', [20, 21], 'cosign')),
      {},
      { userId: 10 },
    )
    const t = getActiveTask(id)!
    engine().act(id, 20, 'addsign', { addsignTo: [22] })
    // 加签人 22 出现在待办，且能成功同意。
    expect(listPendingByTask(t.id).map((a) => a.userid)).toContain(22)
    engine().act(id, 20, 'approve')
    engine().act(id, 21, 'approve')
    engine().act(id, 22, 'approve')
    expect(getInst(id)!.state).toBe(InstState.approved)
  })
})

describe('归档 (archive)', () => {
  it('通过后可归档', () => {
    const id = engine().start(
      def(approver('a', [20], 'or')),
      {},
      { userId: 10 },
    )
    engine().act(id, 20, 'approve')
    engine().archive(id, 10)
    expect(getInst(id)!.status).toBe('archived')
    expect(listEventsByInst(id).some((e) => e.action === 'archive')).toBe(true)
  })
  it('未通过不可归档', () => {
    const id = engine().start(
      def(approver('a', [20], 'or')),
      {},
      { userId: 10 },
    )
    expect(() => engine().archive(id, 10)).toThrow()
  })
})

describe('时限 due_at', () => {
  it('节点配置 dueHours 时建 task 写 due_at', () => {
    const flow: FlowNode = {
      nodeId: 'a',
      type: 'approver',
      settype: 'specific',
      approveMode: 'or',
      userIds: [20],
      dueHours: 24,
    }
    const id = engine().start(def(flow), {}, { userId: 10 })
    expect(getActiveTask(id)!.due_at).toBeTruthy()
  })
})

describe('多级主管 (leader) 展开', () => {
  it('directorLevel=2 按层级拼接 step（产出两个审批节点）', () => {
    const resolveLeader = (_d: number | null | undefined, level: number) =>
      100 + level
    const eng = createEngine({ resolveLeader })
    const flow: FlowNode = {
      nodeId: 'lead',
      type: 'approver',
      settype: 'leader',
      directorLevel: 2,
    }
    const id = eng.start(def(flow), {}, { userId: 10, deptId: 5 })
    // 第一级主管 101 待审
    expect(getActiveTask(id)!.node_id).toBe('lead-1')
    eng.act(id, 101, 'approve')
    expect(getActiveTask(id)!.node_id).toBe('lead-2')
    eng.act(id, 102, 'approve')
    expect(getInst(id)!.state).toBe(InstState.approved)
  })
})

describe('影子推进 advanceSnapshot', () => {
  it('与真实引擎对同一会签节点推进结果一致', () => {
    const snap: RuntimeSnapshot = {
      nodeSequence: [
        {
          nodeId: 'start',
          type: 'start',
          approverIds: [10],
          memberCount: 1,
          isSystem: true,
        },
        {
          nodeId: 'a',
          type: 'approver',
          approveMode: 'cosign',
          approverIds: [20, 21],
          memberCount: 2,
          isSystem: false,
        },
        {
          nodeId: 'b',
          type: 'approver',
          approveMode: 'or',
          approverIds: [22],
          memberCount: 1,
          isSystem: false,
        },
      ],
      curNodeSeqIdx: 1,
      state: InstState.running,
      task: {
        nodeSeqIdx: 1,
        totalApprovers: 2,
        pendingCount: 2,
        agreeCount: 0,
        isFinished: false,
        rejected: false,
      },
      actors: [
        { nodeSeqIdx: 1, actorId: 20, action: 'pending', isSystem: false },
        { nodeSeqIdx: 1, actorId: 21, action: 'pending', isSystem: false },
      ],
      initiatorId: 10,
    }
    const s1 = advanceSnapshot(snap, { actorId: 20, action: 'approve' })
    expect(s1.task!.pendingCount).toBe(1) // 会签未满，停本节点
    expect(s1.curNodeSeqIdx).toBe(1)
    const s2 = advanceSnapshot(s1, { actorId: 21, action: 'approve' })
    expect(s2.curNodeSeqIdx).toBe(2) // 推进到 b
    expect(s2.task!.nodeSeqIdx).toBe(2)
  })

  it('reject 快照终止 state=3', () => {
    const snap: RuntimeSnapshot = {
      nodeSequence: [
        {
          nodeId: 'a',
          type: 'approver',
          approveMode: 'or',
          approverIds: [20],
          memberCount: 1,
          isSystem: false,
        },
      ],
      curNodeSeqIdx: 0,
      state: InstState.running,
      task: {
        nodeSeqIdx: 0,
        totalApprovers: 1,
        pendingCount: 1,
        agreeCount: 0,
        isFinished: false,
        rejected: false,
      },
      actors: [
        { nodeSeqIdx: 0, actorId: 20, action: 'pending', isSystem: false },
      ],
      initiatorId: 10,
    }
    const out = advanceSnapshot(snap, { actorId: 20, action: 'reject' })
    expect(out.state).toBe(InstState.rejected)
  })

  it('或签快照首人即推进到末尾 state=2', () => {
    const snap: RuntimeSnapshot = {
      nodeSequence: [
        {
          nodeId: 'a',
          type: 'approver',
          approveMode: 'or',
          approverIds: [20, 21],
          memberCount: 2,
          isSystem: false,
        },
      ],
      curNodeSeqIdx: 0,
      state: InstState.running,
      task: {
        nodeSeqIdx: 0,
        totalApprovers: 2,
        pendingCount: 2,
        agreeCount: 0,
        isFinished: false,
        rejected: false,
      },
      actors: [
        { nodeSeqIdx: 0, actorId: 20, action: 'pending', isSystem: false },
        { nodeSeqIdx: 0, actorId: 21, action: 'pending', isSystem: false },
      ],
      initiatorId: 10,
    }
    const out = advanceSnapshot(snap, { actorId: 20, action: 'approve' })
    expect(out.state).toBe(InstState.approved)
    expect(out.task).toBeNull()
  })
})

describe('actor 审计记录', () => {
  it('每参与人一条 actor，含 is_system 标记', () => {
    const flow = approver('self', [10], 'or', approver('a', [20], 'or'))
    const id = engine().start(def(flow), {}, { userId: 10 })
    engine().act(id, 20, 'approve')
    const actors = listActorsByInst(id)
    // start(系统) + self自审(系统) + a(真人)
    expect(actors.some((a) => a.node_seq_idx === 0 && a.is_system === 1)).toBe(
      true,
    )
    expect(
      actors.some(
        (a) => a.node_seq_idx === 1 && a.is_system === 1 && a.userid === 10,
      ),
    ).toBe(true)
    expect(
      actors.some(
        (a) => a.userid === 20 && a.action === 'approved' && a.is_system === 0,
      ),
    ).toBe(true)
  })

  it('每节点一条 task', () => {
    const id = engine().start(
      def(approver('a', [20], 'or', approver('b', [21], 'or'))),
      {},
      { userId: 10 },
    )
    engine().act(id, 20, 'approve')
    engine().act(id, 21, 'approve')
    expect(listTasksByInst(id).length).toBe(2)
  })
})
