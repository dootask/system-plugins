/**
 * 审批引擎实现（M2）。复刻旧 Go 引擎（taskService.go / procInstService.go / executionService.go）
 * 的流转语义，所有状态推进在单个 better-sqlite3 事务内完成并写 proc_event 流水。
 *
 * 关键对齐（见 types.ts 硬约束 §1~§5）：
 * - Step = nodeSequence 索引 = proc_inst.cur_node_seq_idx。
 * - 会签靠 proc_task.pending_count 递减；或签首人即定；依次按 approverIds 顺序逐个待办。
 * - 条件分支在 start 展开时按 formData 求值定死。
 * - 抄送/自审节点 isSystem 自动跳过，但写 actor/event（is_system=1）。
 */
import { getDb } from '#/lib/db'
import { getDef } from '#/lib/repo/defs'
import { createInst, getInst, updateInst } from '#/lib/repo/insts'
import {
  createTask,
  finishTask,
  getActiveTask,
  getTask,
  recordAgree,
} from '#/lib/repo/tasks'
import {
  createActor,
  listActorsByInst,
  listPendingByTask,
  setActorAction,
} from '#/lib/repo/actors'
import { addEvent } from '#/lib/repo/events'
import type { ProcActorRow, ProcInstRow, ProcTaskRow } from '#/lib/types'
import { isAutoPass, nodeFinished } from './core'
import { expandFlow } from './flow'
import type { FlowNode, ExpandContext } from './flow'
import type {
  Actor,
  ActOptions,
  ApprovalEngine,
  EngineAction,
  NodeInfo,
  ProcInst,
  Starter,
} from './types'
import { InstState } from './types'

/** 引擎依赖（解析主管/角色、起标题等可由调用方注入；测试可省略）。 */
export interface EngineDeps {
  resolveLeader?: ExpandContext['resolveLeader']
  resolveRole?: ExpandContext['resolveRole']
}

class Engine implements ApprovalEngine {
  constructor(private deps: EngineDeps = {}) {}

  start(
    defId: number,
    formData: Record<string, unknown>,
    starter: Starter,
  ): number {
    const db = getDb()
    const tx = db.transaction((): number => {
      const def = getDef(defId)
      if (!def) throw new Error(`流程定义 ${defId} 不存在`)
      if (def.status !== 'enabled') throw new Error('该流程已停用，无法发起')

      const root = JSON.parse(def.flow_nodes || '{}') as FlowNode
      const ctx: ExpandContext = {
        starterId: starter.userId,
        formData,
        resolveLeader: this.deps.resolveLeader,
        resolveRole: this.deps.resolveRole,
      }
      const seq = expandFlow(root, ctx)

      const inst = createInst({
        def_id: def.id,
        def_version: def.version,
        title: (formData.title as string) || def.name,
        form_data: JSON.stringify(formData),
        initiator_id: starter.userId,
        dept_id: starter.deptId ?? null,
        status: 'running',
        state: InstState.running,
        node_sequence: JSON.stringify(seq),
        cur_node_seq_idx: 0,
        cur_node_id: seq[0]?.nodeId ?? null,
      })

      // 起点事件（提交）。
      addEvent({ inst_id: inst.id, actor_id: starter.userId, action: 'submit' })
      // start 节点写一条系统 actor（审计 + 详情起点展示）。
      createActor({
        inst_id: inst.id,
        node_seq_idx: 0,
        userid: starter.userId,
        role: 'approver',
        action: 'approved',
        is_system: 1,
      })

      // 从 start 之后开始落地第一个真实待审节点（沿途抄送/自审自动处理）。
      this.settleFrom(inst, seq, 1)
      return inst.id
    })
    return tx()
  }

  act(
    instId: number,
    actorId: number,
    action: EngineAction,
    opts: ActOptions = {},
  ): void {
    const db = getDb()
    const tx = db.transaction((): void => {
      const row = getInst(instId)
      if (!row) throw new Error('审批单不存在')
      if (row.state !== InstState.pending && row.state !== InstState.running) {
        throw new Error('审批单已结束，无法操作')
      }
      const seq = parseSeq(row)
      const task = getActiveTask(instId)

      switch (action) {
        case 'approve':
          return this.doApprove(row, seq, task, actorId, opts)
        case 'reject':
          return this.doReject(row, task, actorId, opts)
        case 'return':
          return this.doReturn(row, task, actorId, opts)
        case 'withdraw':
          return this.doWithdraw(row, seq, task, actorId, opts)
        case 'transfer':
          return this.doTransfer(row, task, actorId, opts)
        case 'addsign':
          return this.doAddsign(row, task, actorId, opts)
        default:
          throw new Error(`不支持的动作: ${action as string}`)
      }
    })
    tx()
  }

  archive(instId: number, by: number): void {
    const db = getDb()
    db.transaction(() => {
      const row = getInst(instId)
      if (!row) throw new Error('审批单不存在')
      if (row.state !== InstState.approved)
        throw new Error('仅通过的审批单可归档')
      updateInst(instId, { status: 'archived' })
      addEvent({ inst_id: instId, actor_id: by, action: 'archive' })
    })()
  }

  /**
   * 退回后由发起人改表单重新提交续审（M2 扩展，超出 M1 接口签名）。
   * 用新 formData 重新展开 node_sequence（条件可能重新求值），从 start 之后续推。
   */
  resubmit(
    instId: number,
    formData: Record<string, unknown> | undefined,
  ): void {
    const db = getDb()
    db.transaction(() => {
      const row = getInst(instId)
      if (!row) throw new Error('审批单不存在')
      if (row.state !== InstState.pending)
        throw new Error('仅退回待发起人修改的单可重新提交')
      const def = getDef(row.def_id)
      if (!def) throw new Error('流程定义不存在')
      const fd =
        formData ??
        (JSON.parse(row.form_data || '{}') as Record<string, unknown>)
      const root = JSON.parse(def.flow_nodes || '{}') as FlowNode
      const seq = expandFlow(root, {
        starterId: row.initiator_id,
        formData: fd,
        resolveLeader: this.deps.resolveLeader,
        resolveRole: this.deps.resolveRole,
      })
      updateInst(instId, {
        form_data: JSON.stringify(fd),
        node_sequence: JSON.stringify(seq),
        cur_node_seq_idx: 0,
        cur_node_id: seq[0]?.nodeId ?? null,
        state: InstState.running,
        status: 'running',
      })
      addEvent({
        inst_id: instId,
        actor_id: row.initiator_id,
        action: 'submit',
        remark: '退回后重新提交',
      })
      const fresh = getInst(instId)!
      this.settleFrom(fresh, seq, 1)
    })()
  }

  getRuntime(instId: number): ProcInst | undefined {
    const row = getInst(instId)
    if (!row) return undefined
    const seq = parseSeq(row)
    const task = getActiveTask(instId)
    const pending = task
      ? listPendingByTask(task.id).map((a) => actorRowToObj(a))
      : []
    return {
      id: row.id,
      defId: row.def_id,
      defVersion: row.def_version,
      title: row.title,
      formData: JSON.parse(row.form_data || '{}'),
      initiatorId: row.initiator_id,
      deptId: row.dept_id,
      state: row.state as ProcInst['state'],
      nodeSequence: seq,
      curNodeSeqIdx: row.cur_node_seq_idx,
      curNodeId: row.cur_node_id,
      pendingActors: pending,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      finishedAt: row.finished_at,
    }
  }

  // ───────────────────────── 动作实现 ─────────────────────────

  private doApprove(
    row: ProcInstRow,
    seq: Array<NodeInfo>,
    task: ProcTaskRow | undefined,
    actorId: number,
    opts: ActOptions,
  ): void {
    if (!task) throw new Error('当前无待办任务')
    const actor = this.requirePendingActor(task.id, actorId)
    const node = seq[task.node_seq_idx]
    const mode =
      node.approveMode ?? (task.approve_mode as 'or' | 'cosign' | 'sequence')

    setActorAction(actor.id, 'approved', opts.comment ?? null)
    addEvent({
      inst_id: row.id,
      task_id: task.id,
      actor_id: actorId,
      action: 'approve',
      remark: opts.comment ?? null,
      attachments: opts.attachments ?? null,
    })

    let updated = recordAgree(task.id)!
    // 或签：首人即定，pending 归零。
    if (mode === 'or' && updated.pending_count > 0) {
      getDb()
        .prepare('UPDATE proc_task SET pending_count = 0 WHERE id = ?')
        .run(task.id)
      updated = getTask(task.id)!
    }

    if (!nodeFinished(updated.pending_count, false)) {
      // 会签未满；若为依次审批，激活下一个待办人。
      if (mode === 'sequence') this.activateNextSequential(row.id, task, seq)
      return
    }

    // 节点通过 → 结束本任务并推进。
    finishTask(task.id, 'approved', opts.comment ?? null)
    this.settleFrom(row, seq, task.node_seq_idx + 1)
  }

  private doReject(
    row: ProcInstRow,
    task: ProcTaskRow | undefined,
    actorId: number,
    opts: ActOptions,
  ): void {
    if (!task) throw new Error('当前无待办任务')
    const actor = this.requirePendingActor(task.id, actorId)
    setActorAction(actor.id, 'rejected', opts.comment ?? null)
    finishTask(task.id, 'rejected', opts.comment ?? null)
    addEvent({
      inst_id: row.id,
      task_id: task.id,
      actor_id: actorId,
      action: 'reject',
      remark: opts.comment ?? null,
      attachments: opts.attachments ?? null,
    })
    // 一票拒绝立即终止整单（旧引擎 MoveToPrevStage → state=3，不可逆，不建回退任务）。
    updateInst(row.id, {
      state: InstState.rejected,
      status: 'rejected',
      finished_at: now(),
    })
  }

  private doReturn(
    row: ProcInstRow,
    task: ProcTaskRow | undefined,
    actorId: number,
    opts: ActOptions,
  ): void {
    if (!task) throw new Error('当前无待办任务')
    const actor = this.requirePendingActor(task.id, actorId)
    setActorAction(actor.id, 'rejected', opts.comment ?? null)
    finishTask(task.id, 'rejected', opts.comment ?? null)
    addEvent({
      inst_id: row.id,
      task_id: task.id,
      actor_id: actorId,
      action: 'return',
      remark: opts.comment ?? null,
      attachments: opts.attachments ?? null,
    })
    // 退回发起人：区别于 reject，置回待审(0)、指针回起点，发起人可改后重新提交续审
    // （resubmit 由上层调 settleFrom(inst, seq, 1) 续推，引擎不在此自动重开节点）。
    updateInst(row.id, {
      state: InstState.pending,
      status: 'running',
      cur_node_seq_idx: 0,
      cur_node_id: seqFirstId(row),
    })
  }

  private doWithdraw(
    row: ProcInstRow,
    seq: Array<NodeInfo>,
    task: ProcTaskRow | undefined,
    actorId: number,
    _opts: ActOptions,
  ): void {
    // 撤回：仅发起人本人、且当前节点尚无人审过（pending_count==total）时可撤回（旧引擎语义）。
    if (actorId !== row.initiator_id) throw new Error('只能撤回本人发起的审批')
    if (row.cur_node_seq_idx === 0) throw new Error('开始位置无法撤回')
    if (task) {
      if (task.is_finished) throw new Error('已审批结束，无法撤回')
      if (task.pending_count !== task.total_approvers)
        throw new Error('已有人审批，无法撤回')
      finishTask(task.id, 'skipped')
      for (const a of listPendingByTask(task.id))
        setActorAction(a.id, 'withdrawn')
    }
    void seq
    addEvent({
      inst_id: row.id,
      actor_id: actorId,
      action: 'withdraw',
      remark: _opts.comment ?? null,
      attachments: _opts.attachments ?? null,
    })
    updateInst(row.id, {
      state: InstState.withdrawn,
      status: 'withdrawn',
      finished_at: now(),
    })
  }

  private doTransfer(
    row: ProcInstRow,
    task: ProcTaskRow | undefined,
    actorId: number,
    opts: ActOptions,
  ): void {
    if (!task) throw new Error('当前无待办任务')
    if (!opts.transferTo) throw new Error('transfer 需要 transferTo')
    const actor = this.requirePendingActor(task.id, actorId)
    // 当前人标记转交（已处置），新增受让人为 pending（计数不变，仅换人）。
    setActorAction(actor.id, 'approved', `转交给 ${opts.transferTo}`)
    createActor({
      inst_id: row.id,
      task_id: task.id,
      node_seq_idx: task.node_seq_idx,
      userid: opts.transferTo,
      role: 'approver',
      action: 'pending',
    })
    addEvent({
      inst_id: row.id,
      task_id: task.id,
      actor_id: actorId,
      action: 'transfer',
      remark: String(opts.transferTo),
    })
  }

  private doAddsign(
    row: ProcInstRow,
    task: ProcTaskRow | undefined,
    actorId: number,
    opts: ActOptions,
  ): void {
    if (!task) throw new Error('当前无待办任务')
    const add = opts.addsignTo ?? []
    if (add.length === 0) throw new Error('addsign 需要 addsignTo')
    for (const uid of add) {
      createActor({
        inst_id: row.id,
        task_id: task.id,
        node_seq_idx: task.node_seq_idx,
        userid: uid,
        role: 'addsign',
        action: 'pending',
      })
    }
    // 会签人数 +N：total 与 pending 同增（旧引擎运行时加签）。
    getDb()
      .prepare(
        'UPDATE proc_task SET total_approvers = total_approvers + ?, pending_count = pending_count + ? WHERE id = ?',
      )
      .run(add.length, add.length, task.id)
    addEvent({
      inst_id: row.id,
      task_id: task.id,
      actor_id: actorId,
      action: 'addsign',
      remark: add.join(','),
    })
  }

  // ───────────────────────── 推进 / 落地 ─────────────────────────

  /**
   * 从 fromIdx 起沿线性序列前进：自动处理 isSystem（抄送写已完成 actor）与自审/已审过自动通过，
   * 直到落在第一个真实待审 approver 节点（建 task + pending actors），或走到末尾置 state=2。
   * 复刻旧 MoveStage 的「下一节点是抄送/自己/已审 → 自动通过递归」。
   */
  private settleFrom(
    row: ProcInstRow,
    seq: Array<NodeInfo>,
    fromIdx: number,
  ): void {
    let idx = fromIdx
    while (idx < seq.length) {
      const node = seq[idx]
      if (node.isSystem) {
        // 抄送 / start：写系统 actor（抄送人 role=cc），指针跳过。
        if (node.type === 'notifier') {
          for (const uid of node.approverIds) {
            createActor({
              inst_id: row.id,
              node_seq_idx: idx,
              userid: uid,
              role: 'cc',
              action: 'approved',
              is_system: 1,
            })
          }
        }
        idx++
        continue
      }
      if (node.type !== 'approver' || node.approverIds.length === 0) {
        idx++
        continue
      }
      if (isAutoPass(seq, idx, row.initiator_id)) {
        // 自审 / 已审过：建一条已完成系统 task + 系统 actor，指针跳过。
        const t = createTask({
          inst_id: row.id,
          node_id: node.nodeId,
          node_seq_idx: idx,
          node_name: node.name ?? null,
          approve_mode: node.approveMode ?? 'or',
          total_approvers: node.memberCount,
          pending_count: 0,
        })
        finishTask(t.id, 'skipped', '自动通过（审批人为发起人或已审过）')
        for (const uid of node.approverIds) {
          createActor({
            inst_id: row.id,
            task_id: t.id,
            node_seq_idx: idx,
            userid: uid,
            role: 'approver',
            action: 'approved',
            is_system: 1,
          })
        }
        idx++
        continue
      }
      // 落在真实待审节点：建 task + pending actors。
      this.openNode(row, seq, idx)
      return
    }
    // 走到末尾：通过。
    updateInst(row.id, {
      state: InstState.approved,
      status: 'approved',
      cur_node_seq_idx: seq.length,
      cur_node_id: null,
      finished_at: now(),
    })
  }

  /** 在 idx 处开节点：建 task、按 approveMode 建 pending actor、推进指针、置 state=1。 */
  private openNode(row: ProcInstRow, seq: Array<NodeInfo>, idx: number): void {
    const node = seq[idx]
    const mode = node.approveMode ?? 'or'
    const total = node.memberCount
    const t = createTask({
      inst_id: row.id,
      node_id: node.nodeId,
      node_seq_idx: idx,
      node_name: node.name ?? null,
      approve_mode: mode,
      assignee_id: node.approverIds[0] ?? null,
      total_approvers: total,
      // 计数基准：会签=全员，或签=全员（首人通过即归零），依次=全员（逐个激活）。
      pending_count: total,
      due_at: node.dueHours ? dueAt(node.dueHours) : null,
    })

    if (mode === 'sequence') {
      // 依次：仅激活第一人为 pending，其余待激活。
      createActor({
        inst_id: row.id,
        task_id: t.id,
        node_seq_idx: idx,
        userid: node.approverIds[0],
        role: 'approver',
        action: 'pending',
      })
    } else {
      for (const uid of node.approverIds) {
        createActor({
          inst_id: row.id,
          task_id: t.id,
          node_seq_idx: idx,
          userid: uid,
          role: 'approver',
          action: 'pending',
        })
      }
    }
    updateInst(row.id, {
      state: InstState.running,
      cur_node_seq_idx: idx,
      cur_node_id: node.nodeId,
    })
  }

  /** 依次审批：上一人通过后激活 approverIds 中的下一个尚未参与的人。 */
  private activateNextSequential(
    instId: number,
    task: ProcTaskRow,
    seq: Array<NodeInfo>,
  ): void {
    const node = seq[task.node_seq_idx]
    const acted = new Set(
      listActorsByInst(instId)
        .filter((a) => a.task_id === task.id)
        .map((a) => a.userid),
    )
    const next = node.approverIds.find((uid) => !acted.has(uid))
    if (next !== undefined) {
      createActor({
        inst_id: instId,
        task_id: task.id,
        node_seq_idx: task.node_seq_idx,
        userid: next,
        role: 'approver',
        action: 'pending',
      })
    }
  }

  private requirePendingActor(taskId: number, actorId: number) {
    const pending = listPendingByTask(taskId).find((a) => a.userid === actorId)
    if (!pending) throw new Error('您不是当前待审人或已处理过')
    return pending
  }
}

// ───────────────────────── 辅助 ─────────────────────────

function parseSeq(row: ProcInstRow): Array<NodeInfo> {
  return JSON.parse(row.node_sequence || '[]') as Array<NodeInfo>
}

function seqFirstId(row: ProcInstRow): string | null {
  return parseSeq(row)[0]?.nodeId ?? null
}

function actorRowToObj(a: ProcActorRow): Actor {
  return {
    id: a.id,
    instId: a.inst_id,
    taskId: a.task_id,
    nodeSeqIdx: a.node_seq_idx,
    actorId: a.userid,
    action: a.action as Actor['action'],
    comment: a.comment,
    isSystem: a.is_system === 1,
    createdAt: a.created_at,
  }
}

function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function dueAt(hours: number): string {
  const d = new Date(Date.now() + hours * 3600_000)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

/** 创建引擎实例（可注入主管/角色解析器）。返回类型含 resubmit 扩展。 */
export function createEngine(deps: EngineDeps = {}): Engine {
  return new Engine(deps)
}

export { Engine }
