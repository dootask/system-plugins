/**
 * 审批引擎契约（M1 只定义类型，M2 才实现算法）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 硬约束（与旧 Go 引擎同构 —— 目的：M5 让进行中流程无缝迁移续跑）
 * ────────────────────────────────────────────────────────────────────────
 * 1. 启动时把流程树（proc_def.flow_nodes）**展开成线性 `NodeInfo[]`**，存入
 *    `ProcInst.nodeSequence`。运行期不再读流程树，只读这个线性序列。
 * 2. `Step` = 数组索引 = `ProcInst.curNodeSeqIdx`。节点推进 = 指针 +1（跳过
 *    isSystem 节点），与旧引擎 Step 语义一致。
 * 3. **条件分支（route）在启动展开时按 `formData` 求值定死**，把命中的分支节点
 *    展平进 `nodeSequence`；运行期不再动态求值条件（旧引擎同此，保证迁移可比对）。
 * 4. **会签靠 `Task.pendingCount` 递减**：每有一人 approve 则 `pendingCount--`、
 *    `agreeCount++`；`pendingCount == 0` 且无人 reject ⇒ 该节点通过、推进。
 *    任一人 reject ⇒ 节点拒绝（整单 reject，除非节点配置为退回）。
 *    - cosign 会签：需全员通过（pendingCount 从 totalApprovers 递减到 0）。
 *    - or 或签：一人通过即过（实现上等价于通过后把 pendingCount 置 0）。
 *    - sequence 依次：按 approverIds 顺序逐个 pending，前一人通过才轮到下一人。
 * 5. **抄送 / 发起人自审自动跳过**：节点 `isSystem=true`（notifier 抄送、
 *    起点 start、或审批人恰为发起人的自审）由引擎自动处理、指针直接跳过，
 *    不产生待办，但仍写 actor/event 记录（action 标 isSystem）。
 *
 * 上述模型字段与 db.ts 的 proc_inst / proc_task / proc_actor 列一一对应，
 * 使得「DB 行 ⇄ 运行时对象」可无损往返（迁移与续跑的基础）。
 */
import type { CommentImage } from '#/lib/types'

// ───────────────────────── 枚举/字面量 ─────────────────────────

/** 线性序列里单个节点的类型。 */
export type NodeType = 'start' | 'approver' | 'notifier' | 'route'

/**
 * 节点审批方式（仅 approver 节点有意义）。
 * - cosign  会签：须全部通过
 * - or      或签：一人通过即过
 * - sequence 依次：按顺序逐个审批
 */
export type ApproveMode = 'cosign' | 'or' | 'sequence'

/** 审批人来源类型（对齐旧引擎 settype 语义：指定成员/角色/部门主管/发起人自选等）。 */
export type SetType =
  | 'specific' // 指定成员
  | 'role' // 指定角色
  | 'leader' // 直属/部门主管
  | 'selfSelect' // 发起人自选
  | 'initiator' // 发起人本人（自审）

/** 流程实例运行态（数字与 db.ts proc_inst.state 对齐）。 */
export const InstState = {
  pending: 0, // 待审
  running: 1, // 审批中
  approved: 2, // 通过
  rejected: 3, // 拒绝
  withdrawn: 4, // 撤回
} as const
export type InstStateValue = (typeof InstState)[keyof typeof InstState]

/** 参与人在某节点上的处置动作（对齐 proc_actor.action）。 */
export type ActorAction = 'pending' | 'approved' | 'rejected' | 'withdrawn'

/** 引擎对外动作。 */
export type EngineAction =
  | 'approve'
  | 'reject'
  | 'return'
  | 'withdraw'
  | 'transfer'
  | 'addsign'

// ───────────────────────── 运行时模型 ─────────────────────────

/**
 * 线性序列元素：流程树展开后的一个节点。
 * 一旦展开即不可变（条件已定死）；这是迁移续跑能逐节点比对的关键。
 */
export interface NodeInfo {
  /** 设计器里的节点 id（与旧引擎 nodeId 体系对齐，迁移按此映射）。 */
  nodeId: string
  /** 节点类型。 */
  type: NodeType
  /** 审批方式（仅 approver 有意义；其它类型可省略）。 */
  approveMode?: ApproveMode
  /** 审批人来源类型。 */
  settype?: SetType
  /** 展开求值后定死的审批/抄送人 id 列表。 */
  approverIds: Array<number>
  /** 应处理人数（= approverIds 去重后的人数，会签计数基准）。 */
  memberCount: number
  /**
   * 系统节点：抄送 / 起点 / 发起人自审等由引擎自动跳过、不产生待办的节点。
   * 见硬约束 §5。
   */
  isSystem: boolean
  /** 节点显示名（冗余，便于详情/消息展示）。 */
  name?: string
  /**
   * 时限（小时）：建该节点 task 时据此算 due_at（M2 新增，可选，不破坏迁移比对——
   * 旧引擎无此字段，迁移来的节点该值为 undefined 即不设时限）。
   */
  dueHours?: number
}

/** 流程实例运行时（DB 行的对象视图，字段对齐 proc_inst）。 */
export interface ProcInst {
  id: number
  defId: number
  defVersion: number
  title: string
  /** 按 schema 填写的表单值（解析后的对象）。 */
  formData: Record<string, unknown>
  initiatorId: number
  deptId?: number | null
  /** 运行态（0待审/1审批中/2通过/3拒绝/4撤回）。 */
  state: InstStateValue
  /** 展开后的线性节点序列（JSON 化的 NodeInfo[]）。 */
  nodeSequence: Array<NodeInfo>
  /** 指针 = nodeSequence 的索引（旧引擎 Step）。 */
  curNodeSeqIdx: number
  /** 冗余：当前节点 nodeId。 */
  curNodeId?: string | null
  /** 当前节点上仍待处理的参与人（待办对象）。 */
  pendingActors: Array<Actor>
  createdAt: string
  updatedAt: string
  finishedAt?: string | null
}

/** 审批任务（一个节点一条，承载会签计数，字段对齐 proc_task）。 */
export interface Task {
  id: number
  instId: number
  nodeId: string
  /** 对应 ProcInst.nodeSequence 的索引。 */
  nodeSeqIdx: number
  nodeName?: string | null
  approveMode: ApproveMode
  /** 应审批人数。 */
  totalApprovers: number
  /** 待审计数（递减；==0 且无拒绝 ⇒ 通过）。 */
  pendingCount: number
  /** 已同意计数。 */
  agreeCount: number
  /** 该节点是否已结束。 */
  isFinished: boolean
  dueAt?: string | null
  createdAt: string
}

/** 参与人（候选/抄送/加签，字段对齐 proc_actor）。 */
export interface Actor {
  id: number
  instId: number
  taskId?: number | null
  /** 锚定到线性序列的节点索引。 */
  nodeSeqIdx: number
  actorId: number
  /** 处置动作。 */
  action: ActorAction
  comment?: string | null
  /** 系统自动处理（抄送/自审自动跳过）。 */
  isSystem: boolean
  createdAt: string
}

// ───────────────────────── 对外接口签名 ─────────────────────────

/** start 的发起人上下文。 */
export interface Starter {
  userId: number
  deptId?: number | null
}

/** act 的可选参数（按动作取用）。 */
export interface ActOptions {
  /** 审批/操作意见。 */
  comment?: string
  /** 审批意见附带的图片（写入对应 proc_event）。 */
  attachments?: Array<CommentImage>
  /** transfer：转交给的目标 userid。 */
  transferTo?: number
  /** addsign：加签的人员 id 列表。 */
  addsignTo?: Array<number>
  /** return：退回目标（'initiator' 退回发起人 / nodeId 退回指定节点）。 */
  returnTo?: 'initiator' | string
}

/**
 * 引擎对外接口（M2 实现）。所有方法在单个 better-sqlite3 事务内完成状态推进，
 * 并写 proc_event 流水；推进结果应可被「影子推进」比对（见 REWRITE_PLAN §9）。
 */
export interface ApprovalEngine {
  /**
   * 发起：按 defId + formData 把流程树展开成线性 NodeInfo[]（条件定死），
   * 落库 proc_inst（state=1）并生成首个非系统节点的 task/actor。
   * @returns 新建实例 id。
   */
  start: (
    defId: number,
    formData: Record<string, unknown>,
    starter: Starter,
  ) => number

  /**
   * 处置当前节点：approve/reject/return/withdraw/transfer/addsign。
   * 会签按 pendingCount 递减判定；满足条件则指针推进（跳过 isSystem 节点）。
   */
  act: (
    instId: number,
    actorId: number,
    action: EngineAction,
    opts?: ActOptions,
  ) => void

  /** 归档：approved 之后由发起人/管理员归档（status→archived）。 */
  archive: (instId: number, by: number) => void

  /** 取运行时快照（DB → 对象视图，供详情页/影子比对）。 */
  getRuntime: (instId: number) => ProcInst | undefined
}
