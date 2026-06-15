/**
 * 正式内置审批模板（请假 / 加班 / 报销 / 差旅 / 评审）。
 *
 * 替代 M3b 临时 dev-seed：首次启动幂等播种（见 ensureBuiltinSeeded），开箱即用，
 * 管理员可在设计器复制/修改。每个模板产出：
 *   - 合法 form_schema（validateFormSchema 通过）；
 *   - 合法 flow_nodes（validateFlowTree 通过、expandFlow 可展开）。
 *
 * ────────────────────────────── 设计假设 ──────────────────────────────
 * 1. 审批人来源用 settype='leader'（部门主管）作默认——播种时无从得知具体 userid，
 *    用「逐级主管」最通用；运行期由 engine-deps.resolveLeader 据发起人部门解析。
 *    未配主管的部门会被自动跳过（expandActor 行为），管理员应按需在设计器改成指定人。
 * 2. 条件分流字段直接读 form_data 的字段 key（与 designer/后端一致）。
 * 3. 报销「金额 > 阈值升级」：阈值取 5000（元）。<=5000 走一级主管；>5000 走二级主管。
 *    route 节点需带一个无条件兜底分支（validateFlowTree 强制），这里兜底=低额分支。
 * 4. 评审「时限」用节点 dueHours（建 task 时算 due_at，cron 扫描提醒）。归档由发起人/
 *    管理员在 approved 后手动触发（archive 动作），不单列为审批节点。
 */
import { createDef, listDefs } from '#/lib/repo/defs'
import { SETTING_KEYS, getSetting, setSetting } from '#/lib/repo/settings'
import { VACATE_TYPES } from '#/lib/migrate/transform'
import type { FlowNode } from '#/lib/engine'
import type { FormSchema } from '#/lib/form/types'

/** 报销升级阈值（元）。> 阈值走更高层级审批。 */
const REIMBURSE_ESCALATE_AMOUNT = 5000

// ───────────────────────── 表单 schema ─────────────────────────

/** 请假：请假类型 / 起止时间 / 天数 / 事由。 */
const LEAVE_SCHEMA: FormSchema = [
  {
    key: 'leaveType',
    type: 'select',
    label: '请假类型',
    required: true,
    options: VACATE_TYPES.map((t) => ({ label: t, value: t })),
  },
  { key: 'startTime', type: 'datetime', label: '开始时间', required: true },
  { key: 'endTime', type: 'datetime', label: '结束时间', required: true },
  {
    key: 'days',
    type: 'number',
    label: '请假天数',
    required: true,
    rules: { min: 0.5 },
    props: { step: 0.5 },
  },
  {
    key: 'reason',
    type: 'textarea',
    label: '请假事由',
    required: true,
    props: { rows: 3 },
  },
]

/** 加班：起止时间 / 时长 / 事由。 */
const OVERTIME_SCHEMA: FormSchema = [
  { key: 'startTime', type: 'datetime', label: '开始时间', required: true },
  { key: 'endTime', type: 'datetime', label: '结束时间', required: true },
  {
    key: 'hours',
    type: 'number',
    label: '加班时长(小时)',
    required: true,
    rules: { min: 0.5 },
    props: { step: 0.5 },
  },
  {
    key: 'reason',
    type: 'textarea',
    label: '加班事由',
    required: true,
    props: { rows: 3 },
  },
]

/** 报销：金额 + 费用明细(子表) + 票据(附件) + 事由。 */
const REIMBURSE_SCHEMA: FormSchema = [
  {
    key: 'amount',
    type: 'money',
    label: '报销总额',
    required: true,
    rules: { min: 0 },
    hint: `超过 ${REIMBURSE_ESCALATE_AMOUNT} 元将升级至上级主管审批`,
  },
  {
    key: 'items',
    type: 'table',
    label: '费用明细',
    required: true,
    columns: [
      { key: 'category', type: 'text', label: '费用类别', required: true },
      {
        key: 'amount',
        type: 'money',
        label: '金额',
        required: true,
        rules: { min: 0 },
      },
      { key: 'note', type: 'text', label: '备注' },
    ],
  },
  {
    key: 'invoices',
    type: 'file',
    label: '票据附件',
    props: { multiple: true },
  },
  {
    key: 'reason',
    type: 'textarea',
    label: '报销事由',
    required: true,
    props: { rows: 3 },
  },
]

/** 差旅申请：行程(子表) + 同行人 + 附件 + 事由。 */
const TRAVEL_SCHEMA: FormSchema = [
  {
    key: 'trips',
    type: 'table',
    label: '行程安排',
    required: true,
    columns: [
      { key: 'from', type: 'text', label: '出发地', required: true },
      { key: 'to', type: 'text', label: '目的地', required: true },
      { key: 'departDate', type: 'date', label: '出发日期', required: true },
      { key: 'returnDate', type: 'date', label: '返回日期' },
      { key: 'transport', type: 'text', label: '交通方式' },
    ],
  },
  {
    key: 'companions',
    type: 'user',
    label: '同行人',
    props: { multiple: true },
  },
  {
    key: 'attachments',
    type: 'file',
    label: '附件',
    props: { multiple: true },
  },
  {
    key: 'reason',
    type: 'textarea',
    label: '出差事由',
    required: true,
    props: { rows: 3 },
  },
]

/** 评审：评审类型 + 资料(附件) + 评审人 + 时限(节点 dueHours) + 事由。 */
const REVIEW_SCHEMA: FormSchema = [
  {
    key: 'reviewType',
    type: 'select',
    label: '评审类型',
    required: true,
    options: [
      { label: '需求评审', value: 'requirement' },
      { label: '设计评审', value: 'design' },
      { label: '代码评审', value: 'code' },
      { label: '方案评审', value: 'proposal' },
      { label: '其他', value: 'other' },
    ],
  },
  {
    key: 'materials',
    type: 'file',
    label: '评审资料',
    required: true,
    props: { multiple: true },
  },
  {
    key: 'reviewers',
    type: 'user',
    label: '评审人',
    required: true,
    props: { multiple: true },
    rules: { minItems: 1 },
  },
  {
    key: 'reason',
    type: 'textarea',
    label: '评审说明',
    required: true,
    props: { rows: 3 },
  },
]

// ───────────────────────── 流程树 ─────────────────────────

/** 单级主管审批（请假/加班/差旅通用）。 */
function leaderFlow(name: string, dueHours?: number): FlowNode {
  return {
    nodeId: 'start',
    type: 'start',
    childNode: {
      nodeId: 'approver-1',
      type: 'approver',
      name,
      settype: 'leader',
      approveMode: 'or',
      directorLevel: 1,
      dueHours,
    },
  }
}

/**
 * 报销流程：金额条件分流。
 * start → route( 高额>阈值 → 二级主管会签? 这里用逐级:一级+二级；低额兜底 → 一级主管 )。
 * route 需含一个无条件兜底分支（低额）。两分支最终都进入抄送财务（settype=selfSelect 留空由发起人/管理员配，
 * 这里用 leader level 1 作占位审批后结束；不强制抄送以免无人可选导致校验失败）。
 */
function reimburseFlow(): FlowNode {
  // 高额：逐级主管审批至第 2 级（directorLevel=2 → 展开为 直属 + 上级 两个审批节点）。
  const highBranchTail: FlowNode = {
    nodeId: 'approver-high',
    type: 'approver',
    name: '逐级主管审批',
    settype: 'leader',
    approveMode: 'or',
    directorLevel: 2,
  }
  const lowBranchTail: FlowNode = {
    nodeId: 'approver-low-1',
    type: 'approver',
    name: '直属主管审批',
    settype: 'leader',
    approveMode: 'or',
    directorLevel: 1,
  }
  return {
    nodeId: 'start',
    type: 'start',
    childNode: {
      nodeId: 'route-amount',
      type: 'route',
      name: '按金额分流',
      conditionNodes: [
        {
          nodeId: 'branch-high',
          name: `金额 > ${REIMBURSE_ESCALATE_AMOUNT}`,
          conditions: [
            { field: 'amount', op: 'gt', value: REIMBURSE_ESCALATE_AMOUNT },
          ],
          childNode: highBranchTail,
        },
        {
          nodeId: 'branch-low',
          name: '默认（普通额度）',
          conditions: [], // 无条件兜底分支（必须存在）
          childNode: lowBranchTail,
        },
      ],
    },
  }
}

/**
 * 评审流程：直属主管审批（带 24h 时限）。
 * 评审人作为表单字段(reviewers)记录，归档由发起人在 approved 后手动 archive。
 */
function reviewFlow(): FlowNode {
  return leaderFlow('评审审批', 24)
}

// ───────────────────────── 播种 ─────────────────────────

/** 内置模板定义。 */
interface BuiltinTemplate {
  name: string
  category: string
  icon: string
  schema: FormSchema
  flow: FlowNode
  sort: number
}

export const BUILTIN_TEMPLATES: ReadonlyArray<BuiltinTemplate> = [
  {
    name: '请假',
    category: 'vacate',
    icon: '🌴',
    schema: LEAVE_SCHEMA,
    flow: leaderFlow('请假审批'),
    sort: 1,
  },
  {
    name: '加班',
    category: 'overtime',
    icon: '🌙',
    schema: OVERTIME_SCHEMA,
    flow: leaderFlow('加班审批'),
    sort: 2,
  },
  {
    name: '报销',
    category: 'reimburse',
    icon: '💰',
    schema: REIMBURSE_SCHEMA,
    flow: reimburseFlow(),
    sort: 3,
  },
  {
    name: '差旅申请',
    category: 'travel',
    icon: '✈️',
    schema: TRAVEL_SCHEMA,
    flow: leaderFlow('差旅审批'),
    sort: 4,
  },
  {
    name: '评审',
    category: 'review',
    icon: '📋',
    schema: REVIEW_SCHEMA,
    flow: reviewFlow(),
    sort: 5,
  },
]

export interface BuiltinSeedResult {
  created: Array<{ id: number; name: string }>
  skipped: boolean
}

/**
 * 幂等播种内置模板（按名字判重，逐个检查）。
 * 用 system 创建人（createdBy=0）：内置模板不属于任何具体用户。
 */
export function seedBuiltinTemplates(): BuiltinSeedResult {
  const existing = new Set(listDefs().map((d) => d.name))
  const created: Array<{ id: number; name: string }> = []

  for (const t of BUILTIN_TEMPLATES) {
    if (existing.has(t.name)) continue
    const d = createDef(
      {
        name: t.name,
        category: t.category,
        icon: t.icon,
        form_schema: JSON.stringify(t.schema),
        flow_nodes: JSON.stringify(t.flow),
        sort_order: t.sort,
      },
      0,
    )
    created.push({ id: d.id, name: d.name })
  }

  return { created, skipped: created.length === 0 }
}

/**
 * 首启幂等入口：未播种过时按名字补齐缺失的内置模板，播种后写标记。
 *
 * seedBuiltinTemplates 本身按名字判重，所以即便迁移已带入同名旧模板（请假/加班）也不会重复，
 * 而迁移没有的报销/差旅/评审仍会被补上——这是之前「库里有任何模板就整体跳过」漏播的修复。
 * 触发时机晚于迁移（见 db.ts）。
 */
export function ensureBuiltinSeeded(): BuiltinSeedResult {
  // 已播种标记存在 → 跳过。
  if (getSetting(SETTING_KEYS.builtinSeeded))
    return { created: [], skipped: true }
  const result = seedBuiltinTemplates()
  setSetting(SETTING_KEYS.builtinSeeded, new Date().toISOString())
  return result
}
