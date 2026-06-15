/**
 * 引擎核心判定（纯函数，无 DB）。engine.ts 与 shadow.ts 共享，保证真实推进与影子推进一致。
 * 复刻旧引擎 taskService.go 的 MoveStage 判定分支。
 */
import type { NodeInfo } from './types'

/** 节点是否完成：会签靠 pendingCount==0 且无人拒绝（旧 task.UnCompleteNum==0）。 */
export function nodeFinished(pendingCount: number, rejected: boolean): boolean {
  return pendingCount <= 0 && !rejected
}

/** 指针 +1（旧引擎 step++）。返回新索引。 */
export function advanceIdx(
  _seq: Array<NodeInfo>,
  idx: number,
): { idx: number } {
  return { idx: idx + 1 }
}

/**
 * 该 approver 节点是否应自动通过（不产生待办）：
 * 复刻旧 MoveStage：审批人 == 发起人，或该审批人已在前序某 approver 节点审过。
 * 仅当节点是单人 approver 时判定（多人节点不整体自动跳过）。
 */
export function isAutoPass(
  seq: Array<NodeInfo>,
  idx: number,
  initiatorId: number,
): boolean {
  const node = seq[idx]
  if (node.type !== 'approver') return false
  if (node.approverIds.length === 0) return false
  // 全部审批人都满足「==发起人 或 前序已审过」才整体自动跳过
  return node.approverIds.every((uid) => {
    if (uid === initiatorId) return true
    for (let i = 0; i < idx; i++) {
      const p = seq[i]
      if (p.type === 'approver' && p.approverIds.includes(uid)) return true
    }
    return false
  })
}

/**
 * 从 idx（含）起，找到下一个需要真实待办的 approver 节点索引。
 * 跳过：isSystem（start/notifier）、空审批人节点、自审/已审过自动通过节点。
 * 返回 >= seq.length 表示已无后续待审节点（流程到末尾）。
 */
export function nextPendingIdx(
  seq: Array<NodeInfo>,
  fromIdx: number,
  initiatorId: number,
): number {
  let idx = fromIdx
  while (idx < seq.length) {
    const n = seq[idx]
    if (
      n.type === 'approver' &&
      n.approverIds.length > 0 &&
      !n.isSystem &&
      !isAutoPass(seq, idx, initiatorId)
    ) {
      return idx
    }
    idx++
  }
  return seq.length
}
