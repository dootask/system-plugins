/**
 * 影子推进（纯函数，无 DB 副作用）。
 *
 * M5 迁移校验用：把「迁移过来的运行时快照」喂给这个纯函数执行一步推进，
 * 与旧 Go 引擎对同一快照的推进结果逐字段比对，验证新引擎流转语义一致后再切流量。
 *
 * 这里只复刻**核心流转算术**（会签计数递减、节点完成判定、指针推进跳过 isSystem /
 * 自审 / 抄送），不触库、不发消息。与 engine.ts 的 act/advance 共享同一套判定逻辑
 * （见 core.ts），保证「影子结果」== 「真实引擎落库后的运行时」。
 */
import type { NodeInfo } from './types'
import { advanceIdx, isAutoPass, nodeFinished } from './core'

/** 单节点会签计数快照（对齐 proc_task 的计数字段）。 */
export interface TaskSnapshot {
  nodeSeqIdx: number
  totalApprovers: number
  pendingCount: number
  agreeCount: number
  isFinished: boolean
  /** 是否有人在此节点拒绝（决定节点是 reject 还是 approve 完成）。 */
  rejected: boolean
}

/** 参与人快照（对齐 proc_actor）。 */
export interface ActorSnapshot {
  nodeSeqIdx: number
  actorId: number
  action: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  isSystem: boolean
}

/** 运行时快照（node_sequence + 指针 + 当前节点计数 + actors）。 */
export interface RuntimeSnapshot {
  nodeSequence: Array<NodeInfo>
  curNodeSeqIdx: number
  state: number // 0待审/1审批中/2通过/3拒绝/4撤回
  /** 当前活动节点的计数快照（null = 无活动 task，例如已终态）。 */
  task: TaskSnapshot | null
  actors: Array<ActorSnapshot>
  initiatorId: number
}

/** 影子推进输入动作。 */
export interface SnapshotAction {
  /** 操作人。 */
  actorId: number
  action: 'approve' | 'reject'
}

/**
 * 对给定快照执行一步推进，返回**新快照**（不改入参）。
 *
 * 语义（与 engine.act/advance 一致）：
 * - reject：当前节点 rejected=true、isFinished=true，整单 state=3，指针停。
 * - approve：pendingCount--、agreeCount++；
 *   - 或签(or)：一人通过即把 pendingCount 归零 → 节点完成；
 *   - 会签(cosign)：pendingCount 减到 0 才完成；
 *   - 依次(sequence)：与会签同一计数判定（顺序由 actors 的 pending 次序保证，这里只算数）。
 *   节点完成后推进指针，跳过 isSystem / 自审自动通过节点，到末尾 state=2。
 */
export function advanceSnapshot(
  snap: RuntimeSnapshot,
  act: SnapshotAction,
): RuntimeSnapshot {
  const next = clone(snap)
  if (next.state !== 0 && next.state !== 1) return next // 终态不再推进
  const task = next.task
  if (!task) return next

  const node = next.nodeSequence[task.nodeSeqIdx]
  const mode = node.approveMode ?? 'or'

  // 记录该参与人的处置
  const actor = next.actors.find(
    (a) =>
      a.nodeSeqIdx === task.nodeSeqIdx &&
      a.actorId === act.actorId &&
      a.action === 'pending',
  )

  if (act.action === 'reject') {
    if (actor) actor.action = 'rejected'
    task.rejected = true
    task.isFinished = true
    next.state = 3
    return next
  }

  // approve
  if (actor) actor.action = 'approved'
  task.pendingCount = Math.max(task.pendingCount - 1, 0)
  task.agreeCount += 1
  if (mode === 'or') task.pendingCount = 0 // 或签：首人即定

  if (!nodeFinished(task.pendingCount, task.rejected)) return next // 会签未满，停在本节点

  // 节点通过 → 推进指针
  task.isFinished = true
  const seq = next.nodeSequence
  let idx = next.curNodeSeqIdx
  for (;;) {
    const r = advanceIdx(seq, idx)
    idx = r.idx
    if (idx >= seq.length) {
      next.curNodeSeqIdx = seq.length
      next.state = 2 // 通过
      next.task = null
      return next
    }
    const n = seq[idx]
    // isSystem（抄送/start）或 自审/已审过 → 继续跳过
    if (n.isSystem || isAutoPass(seq, idx, next.initiatorId)) continue
    // 落在一个真实待审节点
    next.curNodeSeqIdx = idx
    next.state = 1
    next.task = {
      nodeSeqIdx: idx,
      totalApprovers: n.memberCount,
      pendingCount: n.approveMode === 'or' ? n.memberCount : n.memberCount,
      agreeCount: 0,
      isFinished: false,
      rejected: false,
    }
    return next
  }
}

function clone(s: RuntimeSnapshot): RuntimeSnapshot {
  return {
    nodeSequence: s.nodeSequence,
    curNodeSeqIdx: s.curNodeSeqIdx,
    state: s.state,
    task: s.task ? { ...s.task } : null,
    actors: s.actors.map((a) => ({ ...a })),
    initiatorId: s.initiatorId,
  }
}
