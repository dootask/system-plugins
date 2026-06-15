/**
 * 旧库行 → 新 SQLite 模型的**纯转换**（无 DB、无 IO，便于单测）。
 *
 * 三类映射：
 * 1. procdef.resource(流程树) → 新 proc_def.flow_nodes(FlowNode) + 为请假/加班构造 form_schema。
 * 2. execution.node_infos(旧线性节点) → 新 proc_inst.node_sequence(NodeInfo[])。
 * 3. proc_inst.state(0/1/2/3/4) → 新 status；旧 task 计数 → 新 proc_task 计数；
 *    identitylink → proc_actor（action/is_system）。
 *
 * 保证「DB 行 ⇄ 运行时对象」可无损往返，迁移后新引擎 advanceSnapshot/act 能直接续跑。
 */
import type { FieldDef, FormSchema } from '#/lib/form/types'
import type {
  ApproveMode,
  NodeInfo,
  NodeType,
  SetType,
} from '#/lib/engine/types'
import type { FlowNode } from '#/lib/engine/flow'
import type { LegacyNodeInfo } from './legacy-types'

/** 旧 state → 新 proc_inst.status（state 数字本身原样保留到 proc_inst.state）。 */
export function stateToStatus(state: number): string {
  switch (state) {
    case 2:
      return 'approved'
    case 3:
      return 'rejected'
    case 4:
      return 'withdrawn'
    case 0:
    case 1:
    default:
      return 'running'
  }
}

/** 旧 state 是否已结束（2通过/3拒绝/4撤回 → 历史；0/1 → 进行中续跑）。 */
export function isFinishedState(
  state: number,
  isFinished: number | boolean,
): boolean {
  if (state === 2 || state === 3 || state === 4) return true
  // is_finished 兜底（老数据偶有 state 与 is_finished 不同步）。
  return isFinished === 1 || isFinished === true
}

/** 逗号分隔的 userid 串 → number[]（去空、去 NaN）。 */
export function parseIds(csv: string | undefined | null): Array<number> {
  if (!csv) return []
  return csv
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n))
}

// ───────────────────────── 1. procdef → proc_def ─────────────────────────

/** 旧 Settype：1指定成员 / 2主管 / 3连续多级主管。映射到新 SetType。 */
function mapSetType(settype: number | undefined): SetType {
  switch (settype) {
    case 2:
    case 3:
      return 'leader'
    case 1:
    default:
      return 'specific'
  }
}

/** 旧 examineMode：1依次/会签(and) → cosign；其它 → or。 */
function mapApproveMode(examineMode: number | undefined): ApproveMode {
  return examineMode === 1 ? 'cosign' : 'or'
}

/** 旧流程树原始节点（resource JSON 解析后），字段对齐 flow/node.go Node。 */
interface RawTreeNode {
  name?: string
  type?: string // start/approver/notifier/condition/route
  nodeId?: string
  childNode?: RawTreeNode | null
  conditionNodes?: Array<RawTreeNode> | null
  settype?: number
  directorLevel?: number
  examineEndDirectorLevel?: number
  examineMode?: number
  nodeUserList?: Array<{ name?: string; targetId?: string; type?: number }>
}

/** 把旧 nodeUserList 的 targetId 转成 userIds。 */
function userIdsOf(node: RawTreeNode): Array<number> {
  return (node.nodeUserList ?? [])
    .map((u) => parseInt(String(u.targetId ?? ''), 10))
    .filter((n) => Number.isFinite(n))
}

/**
 * 旧流程树 RawTreeNode → 新 FlowNode（递归）。
 * 旧库实际只用到 start→approver→notifier 的单链（见 procdef seeder），
 * 这里把 approver/notifier/start 节点转换并续接 childNode；条件分支(condition/route)
 * 暂保持单链兜底（旧默认模板无条件分支，真实库若有则取首个子分支，与旧引擎
 * 「variable==nil 或单分支取第一个」行为对齐，避免迁移期求值老条件格式）。
 */
function convertTreeNode(
  node: RawTreeNode | null | undefined,
): FlowNode | null {
  if (!node || !node.type) return null
  const type = node.type as NodeType

  if (type === 'start') {
    return {
      nodeId: node.nodeId || 'sid-startevent',
      type: 'start',
      name: node.name,
      childNode: convertTreeNode(node.childNode),
    }
  }

  if (type === 'approver' || type === 'notifier') {
    const settype = mapSetType(node.settype)
    const fn: FlowNode = {
      nodeId: node.nodeId || '',
      type,
      name: node.name,
      settype,
      approveMode:
        type === 'approver' ? mapApproveMode(node.examineMode) : undefined,
      childNode: convertTreeNode(node.childNode),
    }
    if (settype === 'specific') fn.userIds = userIdsOf(node)
    if (settype === 'leader') {
      // 旧 settype=2 单级主管→directorLevel；settype=3 连续多级→examineEndDirectorLevel。
      fn.directorLevel =
        node.settype === 3
          ? node.examineEndDirectorLevel || 1
          : node.directorLevel || 1
    }
    return fn
  }

  // condition/route 或未知：跳过自身，沿第一个子分支/子节点续接（兜底）。
  if (Array.isArray(node.conditionNodes) && node.conditionNodes.length > 0) {
    return convertTreeNode(node.conditionNodes[0])
  }
  return convertTreeNode(node.childNode)
}

/** 解析 procdef.resource → 新 flow_nodes(FlowNode 根)。失败返回 null。 */
export function convertResourceToFlow(resource: string): FlowNode | null {
  let raw: RawTreeNode
  try {
    raw = JSON.parse(resource) as RawTreeNode
  } catch {
    return null
  }
  return convertTreeNode(raw)
}

/** 旧请假类型选项（对齐 types/vars.go VacateTypes）。 */
export const VACATE_TYPES = [
  '年假',
  '事假',
  '病假',
  '调休假',
  '产假',
  '婚假',
  '丧假',
  '陪产假',
  '哺乳假',
  '产检假',
  '其他',
] as const

/**
 * 据流程名推断 category，并为请假/加班构造对应 form_schema（旧 Vars 字段）。
 * 旧 Vars: { type(请假类型), description(事由), startTime, endTime, other }。
 * - 含「请假/假」→ vacate：含「请假类型」下拉 + 起止时间 + 事由 + 其他。
 * - 含「加班」→ overtime：起止时间 + 事由 + 其他（无类型）。
 * - 其它 → custom：通用「事由 + 其他」schema（仍能展示旧 Var 文本）。
 */
export function inferCategoryAndSchema(name: string): {
  category: string
  schema: FormSchema
} {
  const isVacate = name.includes('请假') || /(^|[^加])假/.test(name)
  const isOvertime = name.includes('加班')

  const timeFields: Array<FieldDef> = [
    { key: 'startTime', type: 'date', label: '开始时间', required: true },
    { key: 'endTime', type: 'date', label: '结束时间', required: true },
  ]
  const tailFields: Array<FieldDef> = [
    { key: 'description', type: 'textarea', label: '事由', required: true },
    { key: 'other', type: 'textarea', label: '其他', required: false },
  ]

  if (isVacate) {
    return {
      category: 'vacate',
      schema: [
        {
          key: 'type',
          type: 'select',
          label: '请假类型',
          required: true,
          options: VACATE_TYPES.map((t) => ({ label: t, value: t })),
        },
        ...timeFields,
        ...tailFields,
      ],
    }
  }
  if (isOvertime) {
    return { category: 'overtime', schema: [...timeFields, ...tailFields] }
  }
  // 通用：旧自定义流程无结构化表单，给一个能容纳 Var 的最小 schema。
  return { category: 'custom', schema: [...tailFields] }
}

/** 旧 proc_inst.var(JSON) → form_data 对象。非法/空 → {}。 */
export function varToFormData(
  varStr: string | undefined | null,
): Record<string, unknown> {
  if (!varStr) return {}
  try {
    const v = JSON.parse(varStr)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

// ───────────────────────── 2. node_infos → NodeInfo[] ─────────────────────────

/**
 * 旧 execution.node_infos → 新 NodeInfo[]（线性序列）。
 * 旧序列：[starter, approver|notifier..., end]。
 * - starter → 新 start 节点（isSystem）。
 * - approver → isSystem=false（自审/已审过的自动跳过由引擎运行期判定，迁移保留原值）。
 * - notifier → isSystem=true（抄送恒系统）。
 * - 末尾 end 节点（aproverType=end / type 空）丢弃：新引擎用「指针==length」表达结束。
 */
export function convertNodeInfos(nodeInfosStr: string): Array<NodeInfo> {
  let arr: Array<LegacyNodeInfo>
  try {
    arr = JSON.parse(nodeInfosStr) as Array<LegacyNodeInfo>
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []

  const out: Array<NodeInfo> = []
  for (const n of arr) {
    const at = n.aproverType || n.type
    if (at === 'end' || (!n.type && !n.aproverType)) continue // 丢弃末尾 end

    if (n.type === 'starter' || at === 'start') {
      out.push({
        nodeId: n.nodeId || '0',
        type: 'start',
        approverIds: parseIds(n.aproverId),
        memberCount: 1,
        isSystem: true,
      })
      continue
    }

    const ids = parseIds(n.aproverId)
    const isNotifier = n.type === 'notifier' || at === 'notifier'
    const mode: ApproveMode = n.actType === 'and' ? 'cosign' : 'or'
    out.push({
      nodeId: n.nodeId || '',
      type: isNotifier ? 'notifier' : 'approver',
      approveMode: isNotifier ? undefined : mode,
      settype: mapSetType(n.settype),
      approverIds: ids,
      // memberCount 取旧值（会签的应审人数），缺省回退到 ids 数。
      memberCount:
        typeof n.memberCount === 'number' && n.memberCount > 0
          ? n.memberCount
          : ids.length,
      isSystem: isNotifier,
    })
  }
  return out
}

/**
 * 旧 Task.Step → 新 cur_node_seq_idx。
 * 旧 step 是 nodeInfos 里的索引（starter=0，首个 approver=1…），新 node_sequence 第 0 个
 * 也是 start，索引体系一致，可直接复用。
 */
export function stepToSeqIdx(step: number): number {
  return step >= 0 ? step : 0
}

// ───────────────────────── 3. task / identitylink 映射 ─────────────────────────

/** 旧 task.act_type(and/or) → 新 approve_mode。 */
export function actTypeToMode(actType: string | undefined): ApproveMode {
  return actType === 'and' ? 'cosign' : 'or'
}

/**
 * 旧 identitylink → 新 proc_actor 字段。
 * - type=notifier → role=cc，is_system=1。
 * - type=candidate/participant/主管 → role=approver。
 * - state: 0待处理→pending / 1通过→approved / 2拒绝→rejected / 3撤回→withdrawn。
 * - is_system 透传（旧系统操作标记）。
 */
export function identityToActor(il: {
  type: string
  state: number
  is_system: number
}): { role: string; action: string; is_system: number } {
  const role = il.type === 'notifier' ? 'cc' : 'approver'
  let action: string
  switch (il.state) {
    case 1:
      action = 'approved'
      break
    case 2:
      action = 'rejected'
      break
    case 3:
      action = 'withdrawn'
      break
    case 0:
    default:
      action = 'pending'
  }
  // 抄送恒系统；否则透传旧 is_system。
  const isSystem = role === 'cc' ? 1 : il.is_system ? 1 : 0
  return { role, action, is_system: isSystem }
}

/** identitylink.state → proc_event.action（重建时间线用）。 */
export function identityToEventAction(state: number): string | null {
  switch (state) {
    case 1:
      return 'approve'
    case 2:
      return 'reject'
    case 3:
      return 'withdraw'
    default:
      return null // 0 待处理：无历史事件
  }
}
