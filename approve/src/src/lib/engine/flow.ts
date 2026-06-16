/**
 * 流程树（proc_def.flow_nodes）→ 线性 NodeInfo[] 展开器。
 *
 * 复刻旧引擎 flow/node.go 的 ParseProcessConfig / add2ExecutionList / GetConditionNode：
 * - 递归遍历 childNode 链，遇 route（条件分支）按 formData 求值定死命中分支再继续展平。
 * - approver/notifier 节点按 settype 展开成一个或多个 NodeInfo（settype=leader 连续多级主管会
 *   按层级拼接 nodeId，对齐旧引擎 n.NodeID+strconv.Itoa(i)）。
 * - 头部插入 start 节点（isSystem），尾部不显式插 end（新引擎以「指针走到数组末尾」判定结束，
 *   旧引擎额外 push 了一个 end NodeInfo，新引擎用 curNodeSeqIdx === length 等价表达）。
 *
 * 设计器尚未实现（P2），这里约定一套与旧 Node 同构、但字段语义对齐 M1 NodeInfo 的树格式，
 * 见 FlowNode 注释。M5 迁移时旧 flowable JSON 亦按此结构归一后再展开。
 */
import type { ApproveMode, NodeInfo, NodeType, SetType } from './types'
import { EngineError } from './errors'
import type { TFunc } from '#/lib/i18n/translate'

/**
 * 部门主管解析器：给定层级（1=直属上级，2=再上一级…），返回该层级的全部负责人 userid。
 * 解析口径（由 buildEngineDeps 的闭包实现）：多部门并集 + 逐级上溯 + 跨级去重 + 剔除发起人本人；
 * 发起人若本身是某部门负责人，则取其父部门负责人（不取同级负责人）。无该级则返回空数组。
 */
export type LeaderResolver = (level: number) => Array<number>

/** 角色解析器：给定角色 id 列表，返回这些角色下的成员 userid。 */
export type RoleResolver = (roleIds: Array<number>) => Array<number>

export interface ExpandContext {
  starterId: number
  formData: Record<string, unknown>
  /** settype=leader 时按层级取全部负责人；未提供则跳过该节点（审批人为空）。 */
  resolveLeader?: LeaderResolver
  /** settype=role 时按角色取成员。 */
  resolveRole?: RoleResolver
}

/**
 * 设计器流程树节点（proc_def.flow_nodes JSON 根）。
 * 形态对齐旧引擎 flow.Node：单链 childNode + 可选 conditionNodes（条件分支）。
 */
export interface FlowNode {
  nodeId: string
  /** start/approver/notifier/route。 */
  type: NodeType
  name?: string
  /** 子节点（线性下一步）。 */
  childNode?: FlowNode | null

  // —— approver / notifier 字段 ——
  /** 审批人来源。 */
  settype?: SetType
  /** 审批方式（approver 有意义）。 */
  approveMode?: ApproveMode
  /** settype=specific/selfSelect：直接指定的成员 userid 列表。 */
  userIds?: Array<number>
  /** settype=role：角色 id 列表。 */
  roleIds?: Array<number>
  /** settype=leader：审批到第几级主管（1=直属）；对齐旧 examineEndDirectorLevel。 */
  directorLevel?: number
  /** 时限（小时）：建该节点 task 时据此算 due_at。 */
  dueHours?: number

  // —— route（条件分支）字段 ——
  /** 分支列表（每个分支自带 conditions + 该分支的后续 childNode）。 */
  conditionNodes?: Array<ConditionBranch>
}

/** 条件分支：命中 conditions 后走 childNode。 */
export interface ConditionBranch {
  nodeId: string
  name?: string
  /** AND 关系的条件组；为空数组 = 默认/兜底分支（恒命中）。 */
  conditions?: Array<Condition>
  childNode?: FlowNode | null
}

/** 单条件（对齐旧 NodeConditionList 的 columnId/optType 语义，但用 formData 字段名直配）。 */
export interface Condition {
  /** formData 字段名。 */
  field: string
  /** 比较符。 */
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'
  /** 比较值（in 时为数组）。 */
  value: unknown
}

/** 求值单条件（formData[field] op value）。 */
function evalCondition(
  cond: Condition,
  formData: Record<string, unknown>,
): boolean {
  const actual = formData[cond.field]
  switch (cond.op) {
    case 'eq':
      return actual === cond.value
    case 'ne':
      return actual !== cond.value
    case 'gt':
      return Number(actual) > Number(cond.value)
    case 'gte':
      return Number(actual) >= Number(cond.value)
    case 'lt':
      return Number(actual) < Number(cond.value)
    case 'lte':
      return Number(actual) <= Number(cond.value)
    case 'in':
      return Array.isArray(cond.value) && cond.value.includes(actual)
    case 'contains':
      return Array.isArray(actual) && actual.includes(cond.value)
    default:
      return false
  }
}

/**
 * 选第一个全部条件命中的分支（对齐旧 GetConditionNode：flag>=len(conditionList) 即命中、取首个）。
 * 空 conditions 视为兜底分支恒命中。找不到任何命中分支返回 undefined。
 */
function pickBranch(
  branches: Array<ConditionBranch>,
  formData: Record<string, unknown>,
): ConditionBranch | undefined {
  for (const b of branches) {
    const conds = b.conditions ?? []
    if (conds.every((c) => evalCondition(c, formData))) return b
  }
  return undefined
}

/** 去重并保序。 */
function uniq(ids: Array<number>): Array<number> {
  return [...new Set(ids)]
}

/**
 * 把一个 approver/notifier FlowNode 展开为 NodeInfo[]（settype=leader 可能产出多条）。
 * notifier 永远 isSystem=true（抄送自动跳过）。approver 的 isSystem 由 advance 阶段按
 * 「审批人==发起人 / 已审过」动态判定，这里固定 false。
 */
function expandActor(node: FlowNode, ctx: ExpandContext): Array<NodeInfo> {
  const isNotifier = node.type === 'notifier'
  const approveMode: ApproveMode = node.approveMode ?? 'or'
  const settype: SetType = node.settype ?? 'specific'

  // 连续多级主管：每一级生成一个独立审批节点（复刻旧 settype=3）。
  // 同级可有多名负责人（部门负责人 + 部门管理员、多部门并集），全部纳入该节点，
  // 会签/或签/依次由节点自身的 approveMode 决定（不再硬编码 or）。
  if (settype === 'leader' && !isNotifier) {
    const maxLevel =
      node.directorLevel && node.directorLevel > 0 ? node.directorLevel : 1
    const out: Array<NodeInfo> = []
    for (let i = 0; i < maxLevel; i++) {
      const ids = uniq(ctx.resolveLeader?.(i + 1) ?? [])
      if (ids.length === 0) continue // 该级无负责人 → 跳过（旧引擎 dept==nil 时不 push）
      out.push({
        nodeId: maxLevel > 1 ? `${node.nodeId}-${i + 1}` : node.nodeId,
        type: 'approver',
        approveMode,
        settype,
        approverIds: ids,
        memberCount: ids.length,
        isSystem: false,
        name: node.name,
        dueHours: node.dueHours,
      })
    }
    return out
  }

  // 其它来源：解析出审批/抄送人列表。
  let ids: Array<number> = []
  if (settype === 'initiator') {
    ids = [ctx.starterId]
  } else if (settype === 'role') {
    ids = ctx.resolveRole?.(node.roleIds ?? []) ?? []
  } else {
    // specific / selfSelect：直接用配置/自选的人。
    ids = node.userIds ?? []
  }
  ids = uniq(ids)

  return [
    {
      nodeId: node.nodeId,
      type: isNotifier ? 'notifier' : 'approver',
      approveMode: isNotifier ? undefined : approveMode,
      settype,
      approverIds: ids,
      memberCount: ids.length,
      isSystem: isNotifier, // 抄送恒为系统节点
      name: node.name,
      dueHours: node.dueHours,
    },
  ]
}

/**
 * 遍历流程树（含条件分支的所有 childNode），收集全部 settype=role 节点用到的 roleIds（去重）。
 * 用于发起/重提前异步预取角色成员（resolveRole 是同步签名，需提前备好）。
 * 入参是 proc_def.flow_nodes 解析后的对象（结构未必规整，按需做防御）。
 */
export function collectRoleIds(root: unknown): Array<number> {
  const out = new Set<number>()
  const walk = (node: FlowNode | null | undefined): void => {
    if (!node || typeof node !== 'object') return
    if (node.settype === 'role' && Array.isArray(node.roleIds)) {
      for (const rid of node.roleIds) {
        if (Number.isFinite(rid)) out.add(Number(rid))
      }
    }
    if (Array.isArray(node.conditionNodes)) {
      for (const b of node.conditionNodes) walk(b.childNode)
    }
    walk(node.childNode)
  }
  walk(root as FlowNode)
  return [...out]
}

/**
 * 校验设计器产出的流程树结构（设计器保存前 / 后端入库前用）。返回错误信息或 null。
 * 仅做结构合法性检查，不求值条件（条件在 expandFlow 时按 formData 定死）。
 */
export function validateFlowTree(root: unknown, t: TFunc): string | null {
  if (!root || typeof root !== 'object') return t('engine.flow.invalid')
  const r = root as FlowNode
  if (r.type !== 'start') return t('engine.flow.rootMustStart')
  let approverCount = 0

  const checkNode = (node: FlowNode | null | undefined): string | null => {
    if (!node) return null
    if (node.type === 'approver' || node.type === 'notifier') {
      const settype: SetType = node.settype ?? 'specific'
      const name = node.name || node.nodeId
      if (
        (node.type === 'notifier' ||
          settype === 'specific' ||
          settype === 'selfSelect') &&
        (!Array.isArray(node.userIds) || node.userIds.length === 0)
      ) {
        return t(
          node.type === 'notifier'
            ? 'engine.flow.noNotifier'
            : 'engine.flow.noApprover',
          { name },
        )
      }
      if (
        settype === 'role' &&
        (!Array.isArray(node.roleIds) || node.roleIds.length === 0)
      ) {
        return t('engine.flow.noRole', { name })
      }
      if (
        settype === 'leader' &&
        node.directorLevel != null &&
        node.directorLevel < 1
      ) {
        return t('engine.flow.badLeaderLevel', { name })
      }
      if (node.type === 'approver') approverCount++
    }
    if (node.type === 'route') {
      const branches = node.conditionNodes ?? []
      if (branches.length < 2) return t('engine.flow.routeMinBranches')
      const hasDefault = branches.some(
        (b) => !b.conditions || b.conditions.length === 0,
      )
      if (!hasDefault) return t('engine.flow.routeNeedDefault')
      for (const b of branches) {
        const e = checkNode(b.childNode)
        if (e) return e
      }
    }
    return checkNode(node.childNode)
  }

  const e = checkNode(r.childNode)
  if (e) return e
  if (approverCount === 0) return t('engine.flow.needApprover')
  return null
}

/**
 * 展开流程树为线性 NodeInfo[]：头部补 start 节点，递归展平 childNode 与命中分支。
 * 条件在此按 formData 求值定死（硬约束 §3）。
 */
export function expandFlow(
  root: FlowNode,
  ctx: ExpandContext,
): Array<NodeInfo> {
  const seq: Array<NodeInfo> = []

  // 头部 start 节点（isSystem，自动跳过），对齐旧引擎 PushFront 的 "0" 起点。
  seq.push({
    nodeId: root.type === 'start' ? root.nodeId : 'start',
    type: 'start',
    approverIds: [ctx.starterId],
    memberCount: 1,
    isSystem: true,
    name: root.type === 'start' ? root.name : undefined,
  })

  // 若根本身是 start，从其 childNode 开始；否则从根开始。
  let cur: FlowNode | null | undefined =
    root.type === 'start' ? root.childNode : root

  while (cur) {
    if (cur.type === 'route') {
      const branches = cur.conditionNodes ?? []
      const hit = pickBranch(branches, ctx.formData)
      if (!hit) {
        throw new EngineError('engine.flow.noMatchBranch', {
          nodeId: cur.nodeId,
        })
      }
      // 命中分支的 childNode 接续展平（route 节点自身不进入序列）。
      cur = hit.childNode
      continue
    }
    if (cur.type === 'approver' || cur.type === 'notifier') {
      for (const ni of expandActor(cur, ctx)) seq.push(ni)
    }
    cur = cur.childNode
  }

  return seq
}
