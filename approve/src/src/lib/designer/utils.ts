/**
 * 设计器纯逻辑工具（表单 + 流程），无 DOM 依赖，便于 vitest 直测。
 * 产出对齐 M2 FlowNode（lib/engine/flow.ts）与 M3a FormSchema（lib/form/types.ts）。
 */
import type { FieldDef, FieldType, FormSchema } from '#/lib/form/types'
import type { ApproveMode, SetType } from '#/lib/engine/types'
import type { Condition, ConditionBranch, FlowNode } from '#/lib/engine/flow'

// ───────────────────────── 字段类型元信息 ─────────────────────────

export interface FieldTypeMeta {
  type: FieldType
  label: string
  /** 是否支持 options（select/multiselect）。 */
  hasOptions?: boolean
  /** 可作为条件分支来源（数值/单选）。 */
  conditionable?: boolean
  /** 条件来源是否为数值（支持 > < 比较）。 */
  numeric?: boolean
}

export const FIELD_TYPES: Array<FieldTypeMeta> = [
  { type: 'text', label: '单行文本' },
  { type: 'textarea', label: '多行文本' },
  { type: 'number', label: '数字', conditionable: true, numeric: true },
  { type: 'money', label: '金额', conditionable: true, numeric: true },
  { type: 'date', label: '日期' },
  { type: 'datetime', label: '日期时间' },
  { type: 'daterange', label: '日期范围' },
  { type: 'select', label: '单选下拉', hasOptions: true, conditionable: true },
  { type: 'multiselect', label: '多选', hasOptions: true },
  { type: 'user', label: '人员' },
  { type: 'dept', label: '部门' },
  { type: 'table', label: '明细子表' },
  { type: 'file', label: '附件' },
  { type: 'desc', label: '说明文字' },
]

/** 子表列允许的字段类型（不含 table/file/desc 外的限制由 validate 把关）。 */
export const TABLE_COLUMN_TYPES: Array<FieldTypeMeta> = FIELD_TYPES.filter(
  (t) => t.type !== 'table' && t.type !== 'file' && t.type !== 'desc',
)

export function fieldTypeLabel(type: FieldType): string {
  return FIELD_TYPES.find((t) => t.type === type)?.label ?? type
}

/** 生成唯一字段 key（在已有 keys 内不重复）。 */
export function genFieldKey(type: FieldType, existing: Set<string>): string {
  let i = 1
  let key = `${type}_${i}`
  while (existing.has(key)) {
    i++
    key = `${type}_${i}`
  }
  return key
}

/** 新建一个默认字段定义。 */
export function makeField(type: FieldType, existing: Set<string>): FieldDef {
  const f: FieldDef = {
    key: genFieldKey(type, existing),
    type,
    label: fieldTypeLabel(type),
  }
  if (type === 'select' || type === 'multiselect') {
    f.options = [
      { label: '选项一', value: 'opt1' },
      { label: '选项二', value: 'opt2' },
    ]
  }
  if (type === 'table') {
    f.columns = [{ key: 'col_1', type: 'text', label: '列一' }]
  }
  if (type === 'desc') {
    f.props = { text: '说明文字' }
  }
  return f
}

/** 收集 schema 内已用 key（含子表列），供生成新 key 去重。 */
export function collectFieldKeys(schema: FormSchema): Set<string> {
  const out = new Set<string>()
  for (const f of schema) {
    out.add(f.key)
    for (const c of f.columns ?? []) out.add(c.key)
  }
  return out
}

// ───────────────────────── 条件分支字段来源 ─────────────────────────

export interface ConditionField {
  field: string
  label: string
  numeric: boolean
  /** select 字段的可选项（供条件值下拉）。 */
  options?: Array<{ label: string; value: string | number }>
}

/**
 * 从 form_schema 提取可作为条件分支来源的字段（数值 number/money + 单选 select）。
 * 支撑「金额 > X 升级审批」这类分流。
 */
export function conditionFields(schema: FormSchema): Array<ConditionField> {
  const out: Array<ConditionField> = []
  for (const f of schema) {
    const meta = FIELD_TYPES.find((t) => t.type === f.type)
    if (!meta?.conditionable) continue
    out.push({
      field: f.key,
      label: f.label || f.key,
      numeric: !!meta.numeric,
      options: f.options,
    })
  }
  return out
}

// ───────────────────────── 流程节点工具 ─────────────────────────

let _seq = 0
/** 生成流程节点 id（运行期稳定即可，无需全局唯一性强保证）。 */
export function genNodeId(prefix = 'node'): string {
  _seq++
  return `${prefix}_${Date.now().toString(36)}_${_seq}`
}

export function makeApprover(): FlowNode {
  return {
    nodeId: genNodeId('approver'),
    type: 'approver',
    name: '审批人',
    settype: 'specific',
    approveMode: 'or',
    userIds: [],
  }
}

export function makeNotifier(): FlowNode {
  return {
    nodeId: genNodeId('notifier'),
    type: 'notifier',
    name: '抄送人',
    settype: 'specific',
    userIds: [],
  }
}

export function makeRoute(): FlowNode {
  return {
    nodeId: genNodeId('route'),
    type: 'route',
    name: '条件分支',
    conditionNodes: [
      makeBranch('条件一'),
      makeBranch('其他情况'), // 默认兜底分支（无条件）
    ],
  }
}

export function makeBranch(name: string): ConditionBranch {
  return { nodeId: genNodeId('branch'), name, conditions: [], childNode: null }
}

export function makeCondition(field: string): Condition {
  return { field, op: 'eq', value: '' }
}

export function makeStart(): FlowNode {
  return { nodeId: 'start', type: 'start', name: '发起人', childNode: null }
}

// —— 不可变树操作（设计器以 nodeId 定位增删改） ——

/** 找到 childNode 链尾，把 newNode 接到指定 parent 之后（parent 的 childNode 顶到 newNode 之后）。 */
export function insertAfter(
  root: FlowNode,
  parentId: string,
  newNode: FlowNode,
): FlowNode {
  return mapTree(root, (n) => {
    if (n.nodeId !== parentId) return n
    return { ...n, childNode: { ...newNode, childNode: n.childNode ?? null } }
  })
}

/** 在某分支的开头插入节点（接到该分支 childNode 之前）。 */
export function insertInBranch(
  root: FlowNode,
  branchId: string,
  newNode: FlowNode,
): FlowNode {
  return mapTree(root, (n) => {
    if (!n.conditionNodes) return n
    return {
      ...n,
      conditionNodes: n.conditionNodes.map((b) =>
        b.nodeId === branchId
          ? { ...b, childNode: { ...newNode, childNode: b.childNode ?? null } }
          : b,
      ),
    }
  })
}

/** 删除节点（把其 childNode 顶替自己）。route 删除时其 childNode 接续。 */
export function removeNode(root: FlowNode, nodeId: string): FlowNode {
  const strip = (node: FlowNode | null | undefined): FlowNode | null => {
    if (!node) return null
    if (node.nodeId === nodeId) return strip(node.childNode) // 顶替
    const next: FlowNode = { ...node }
    if (next.conditionNodes) {
      next.conditionNodes = next.conditionNodes.map((b) => ({
        ...b,
        childNode: strip(b.childNode),
      }))
    }
    next.childNode = strip(node.childNode)
    return next
  }
  return strip(root) ?? makeStart()
}

/** 更新单个节点字段（按 nodeId）。 */
export function updateNode(
  root: FlowNode,
  nodeId: string,
  patch: Partial<FlowNode>,
): FlowNode {
  return mapTree(root, (n) => (n.nodeId === nodeId ? { ...n, ...patch } : n))
}

/** 更新某条件分支（按 branchId）。 */
export function updateBranch(
  root: FlowNode,
  branchId: string,
  patch: Partial<ConditionBranch>,
): FlowNode {
  return mapTree(root, (n) => {
    if (!n.conditionNodes) return n
    return {
      ...n,
      conditionNodes: n.conditionNodes.map((b) =>
        b.nodeId === branchId ? { ...b, ...patch } : b,
      ),
    }
  })
}

/** 给 route 增加一个条件分支（插在兜底分支之前）。 */
export function addBranch(root: FlowNode, routeId: string): FlowNode {
  return mapTree(root, (n) => {
    if (n.nodeId !== routeId || !n.conditionNodes) return n
    const branches = [...n.conditionNodes]
    const newBranch = makeBranch(`条件${branches.length}`)
    branches.splice(Math.max(0, branches.length - 1), 0, newBranch)
    return { ...n, conditionNodes: branches }
  })
}

/** 删除一个条件分支；若只剩一个分支则整体移除 route（childNode 接续）。 */
export function removeBranch(
  root: FlowNode,
  routeId: string,
  branchId: string,
): FlowNode {
  const t = mapTree(root, (n) => {
    if (n.nodeId !== routeId || !n.conditionNodes) return n
    return {
      ...n,
      conditionNodes: n.conditionNodes.filter((b) => b.nodeId !== branchId),
    }
  })
  // 分支不足两个则整体解散 route。
  const route = findNode(t, routeId)
  if (route && (route.conditionNodes?.length ?? 0) < 2) {
    return removeNode(t, routeId)
  }
  return t
}

/** 深度遍历并以 fn 重写每个节点（保持不可变）。 */
function mapTree(node: FlowNode, fn: (n: FlowNode) => FlowNode): FlowNode {
  const mapped = fn(node)
  const next: FlowNode = { ...mapped }
  if (next.conditionNodes) {
    next.conditionNodes = next.conditionNodes.map((b) => ({
      ...b,
      childNode: b.childNode ? mapTree(b.childNode, fn) : null,
    }))
  }
  if (next.childNode) next.childNode = mapTree(next.childNode, fn)
  return next
}

export function findNode(root: FlowNode, nodeId: string): FlowNode | null {
  if (root.nodeId === nodeId) return root
  for (const b of root.conditionNodes ?? []) {
    if (b.childNode) {
      const f = findNode(b.childNode, nodeId)
      if (f) return f
    }
  }
  return root.childNode ? findNode(root.childNode, nodeId) : null
}

// —— 审批人/抄送人/设置类型可读文案 ——

export const SET_TYPE_LABEL: Record<SetType, string> = {
  specific: '指定成员',
  role: '指定角色',
  leader: '部门主管/连续多级主管',
  selfSelect: '发起人自选',
  initiator: '发起人自己',
}

export const APPROVE_MODE_LABEL: Record<ApproveMode, string> = {
  or: '或签（一人通过即可）',
  cosign: '会签（须全部通过）',
  sequence: '依次审批',
}

export const OP_LABEL: Record<Condition['op'], string> = {
  eq: '等于',
  ne: '不等于',
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  in: '属于',
  contains: '包含',
}
