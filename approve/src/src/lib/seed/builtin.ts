/**
 * 全套内置审批模板（假勤 / 行政 / 财务 / 人事 / 其他，共 24 个）。
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
import type { FieldDef, FormSchema } from '#/lib/form/types'

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

// 精简模板的通用字段构造器：必填事由、可选备注、可选多附件、单/多选项。
const reasonField = (label: string): FieldDef => ({
  key: 'reason',
  type: 'textarea',
  label,
  required: true,
  props: { rows: 3 },
})
const noteField = (label = '备注'): FieldDef => ({
  key: 'note',
  type: 'textarea',
  label,
  props: { rows: 3 },
})
const filesField = (label = '附件'): FieldDef => ({
  key: 'files',
  type: 'file',
  label,
  props: { multiple: true },
})
const opts = (...labels: Array<string>): Array<{ label: string; value: string }> =>
  labels.map((v) => ({ label: v, value: v }))

/**
 * 全套内置模板（假勤 / 行政 / 财务 / 人事 / 其他）。category 用分组码，直接对应
 * 「发起申请」宫格分组（见 lib/categories）。请假/加班/报销/差旅/评审沿用既有详细
 * schema，其余按「关键字段 + 事由 + 附件」精简，管理员可在设计器细化。
 * 审批流默认单级直属主管（settype=leader），报销含金额分流。
 */
export const BUILTIN_TEMPLATES: ReadonlyArray<BuiltinTemplate> = [
  // ── 假勤 ──
  { name: '请假', category: 'attendance', icon: '🌴', schema: LEAVE_SCHEMA, flow: leaderFlow('请假审批'), sort: 1 },
  { name: '出差', category: 'attendance', icon: '✈️', schema: TRAVEL_SCHEMA, flow: leaderFlow('出差审批'), sort: 2 },
  {
    name: '外出',
    category: 'attendance',
    icon: '🚪',
    schema: [
      { key: 'startTime', type: 'datetime', label: '开始时间', required: true },
      { key: 'endTime', type: 'datetime', label: '结束时间', required: true },
      { key: 'place', type: 'text', label: '外出地点', required: true },
      reasonField('外出事由'),
    ],
    flow: leaderFlow('外出审批'),
    sort: 3,
  },
  { name: '加班', category: 'attendance', icon: '🌙', schema: OVERTIME_SCHEMA, flow: leaderFlow('加班审批'), sort: 4 },

  // ── 行政 ──
  {
    name: '会议室预定',
    category: 'admin',
    icon: '📅',
    schema: [
      { key: 'topic', type: 'text', label: '会议主题', required: true },
      { key: 'startTime', type: 'datetime', label: '开始时间', required: true },
      { key: 'endTime', type: 'datetime', label: '结束时间', required: true },
      { key: 'attendees', type: 'user', label: '参会人', props: { multiple: true } },
      reasonField('会议用途'),
    ],
    flow: leaderFlow('会议室预定审批'),
    sort: 5,
  },
  {
    name: '物品领用',
    category: 'admin',
    icon: '📦',
    schema: [
      { key: 'item', type: 'text', label: '领用物品', required: true },
      { key: 'qty', type: 'number', label: '数量', required: true, rules: { min: 1 } },
      reasonField('领用用途'),
      filesField(),
    ],
    flow: leaderFlow('物品领用审批'),
    sort: 6,
  },
  {
    name: '物品维修',
    category: 'admin',
    icon: '🔧',
    schema: [
      { key: 'item', type: 'text', label: '报修物品', required: true },
      { key: 'fault', type: 'textarea', label: '故障描述', required: true, props: { rows: 3 } },
      filesField('故障图片'),
    ],
    flow: leaderFlow('物品维修审批'),
    sort: 7,
  },
  {
    name: '用章',
    category: 'admin',
    icon: '🖊️',
    schema: [
      { key: 'sealType', type: 'select', label: '用章类型', required: true, options: opts('公章', '合同章', '财务章', '法人章', '其他') },
      { key: 'docName', type: 'text', label: '文件名称', required: true },
      reasonField('用章用途'),
      filesField(),
    ],
    flow: leaderFlow('用章审批'),
    sort: 8,
  },
  {
    name: '用车',
    category: 'admin',
    icon: '🚗',
    schema: [
      { key: 'useTime', type: 'datetime', label: '用车时间', required: true },
      { key: 'returnTime', type: 'datetime', label: '预计归还' },
      { key: 'destination', type: 'text', label: '目的地', required: true },
      reasonField('用车事由'),
    ],
    flow: leaderFlow('用车审批'),
    sort: 9,
  },
  {
    name: '公文流转',
    category: 'admin',
    icon: '📃',
    schema: [
      { key: 'title', type: 'text', label: '公文标题', required: true },
      { key: 'docType', type: 'select', label: '公文类型', options: opts('请示', '报告', '通知', '函', '其他') },
      { key: 'content', type: 'textarea', label: '正文', required: true, props: { rows: 4 } },
      filesField(),
    ],
    flow: leaderFlow('公文流转审批'),
    sort: 10,
  },
  {
    name: '通用审批',
    category: 'admin',
    icon: '📋',
    schema: [
      { key: 'title', type: 'text', label: '事项标题', required: true },
      reasonField('事项说明'),
      filesField(),
    ],
    flow: leaderFlow('通用审批'),
    sort: 11,
  },

  // ── 财务 ──
  { name: '报销', category: 'finance', icon: '💰', schema: REIMBURSE_SCHEMA, flow: reimburseFlow(), sort: 12 },
  {
    name: '费用',
    category: 'finance',
    icon: '🧾',
    schema: [
      { key: 'feeType', type: 'select', label: '费用类型', required: true, options: opts('办公费', '差旅费', '招待费', '交通费', '通讯费', '其他') },
      { key: 'amount', type: 'money', label: '金额', required: true, rules: { min: 0 } },
      reasonField('费用说明'),
      filesField('票据'),
    ],
    flow: leaderFlow('费用审批'),
    sort: 13,
  },
  {
    name: '付款',
    category: 'finance',
    icon: '💴',
    schema: [
      { key: 'payee', type: 'text', label: '收款方', required: true },
      { key: 'amount', type: 'money', label: '付款金额', required: true, rules: { min: 0 } },
      reasonField('付款事由'),
      filesField(),
    ],
    flow: leaderFlow('付款审批'),
    sort: 14,
  },
  {
    name: '合同审批',
    category: 'finance',
    icon: '📄',
    schema: [
      { key: 'name', type: 'text', label: '合同名称', required: true },
      { key: 'party', type: 'text', label: '对方单位' },
      { key: 'amount', type: 'money', label: '合同金额', rules: { min: 0 } },
      filesField('合同附件'),
      noteField('说明'),
    ],
    flow: leaderFlow('合同审批'),
    sort: 15,
  },
  {
    name: '采购',
    category: 'finance',
    icon: '🛒',
    schema: [
      {
        key: 'items',
        type: 'table',
        label: '采购清单',
        required: true,
        columns: [
          { key: 'name', type: 'text', label: '物品', required: true },
          { key: 'qty', type: 'number', label: '数量', required: true, rules: { min: 1 } },
          { key: 'price', type: 'money', label: '预估单价', rules: { min: 0 } },
        ],
      },
      { key: 'budget', type: 'money', label: '预算金额', required: true, rules: { min: 0 } },
      reasonField('采购事由'),
      filesField(),
    ],
    flow: leaderFlow('采购审批'),
    sort: 16,
  },
  {
    name: '活动经费',
    category: 'finance',
    icon: '🎉',
    schema: [
      { key: 'name', type: 'text', label: '活动名称', required: true },
      { key: 'date', type: 'date', label: '活动日期' },
      { key: 'budget', type: 'money', label: '预算金额', required: true, rules: { min: 0 } },
      reasonField('活动方案'),
      filesField(),
    ],
    flow: leaderFlow('活动经费审批'),
    sort: 17,
  },

  // ── 人事 ──
  {
    name: '入职申请',
    category: 'hr',
    icon: '🧑‍💼',
    schema: [
      { key: 'name', type: 'text', label: '姓名', required: true },
      { key: 'dept', type: 'dept', label: '拟入职部门' },
      { key: 'position', type: 'text', label: '拟任岗位' },
      { key: 'date', type: 'date', label: '入职日期' },
      noteField('备注'),
      filesField(),
    ],
    flow: leaderFlow('入职审批'),
    sort: 18,
  },
  {
    name: '转正申请',
    category: 'hr',
    icon: '📈',
    schema: [
      { key: 'hireDate', type: 'date', label: '入职日期' },
      { key: 'date', type: 'date', label: '转正日期', required: true },
      { key: 'summary', type: 'textarea', label: '转正述职', required: true, props: { rows: 4 } },
      filesField(),
    ],
    flow: leaderFlow('转正审批'),
    sort: 19,
  },
  {
    name: '调动申请',
    category: 'hr',
    icon: '🔀',
    schema: [
      { key: 'fromDept', type: 'dept', label: '现部门' },
      { key: 'toDept', type: 'dept', label: '拟调入部门', required: true },
      reasonField('调动原因'),
      { key: 'date', type: 'date', label: '生效日期' },
    ],
    flow: leaderFlow('调动审批'),
    sort: 20,
  },
  {
    name: '离职申请',
    category: 'hr',
    icon: '👋',
    schema: [
      { key: 'date', type: 'date', label: '离职日期', required: true },
      reasonField('离职原因'),
      { key: 'handover', type: 'textarea', label: '工作交接说明', props: { rows: 3 } },
      filesField(),
    ],
    flow: leaderFlow('离职审批'),
    sort: 21,
  },
  {
    name: '绩效',
    category: 'hr',
    icon: '📊',
    schema: [
      { key: 'period', type: 'text', label: '考核周期', required: true },
      { key: 'summary', type: 'textarea', label: '自评', required: true, props: { rows: 4 } },
      filesField(),
    ],
    flow: leaderFlow('绩效审批'),
    sort: 22,
  },
  {
    name: '招聘需求',
    category: 'hr',
    icon: '💼',
    schema: [
      { key: 'position', type: 'text', label: '招聘岗位', required: true },
      { key: 'count', type: 'number', label: '招聘人数', required: true, rules: { min: 1 } },
      { key: 'dept', type: 'dept', label: '需求部门' },
      { key: 'requirement', type: 'textarea', label: '岗位要求', required: true, props: { rows: 4 } },
      { key: 'date', type: 'date', label: '期望到岗' },
    ],
    flow: leaderFlow('招聘审批'),
    sort: 23,
  },

  // ── 其他 ──
  { name: '评审', category: 'other', icon: '📋', schema: REVIEW_SCHEMA, flow: reviewFlow(), sort: 24 },
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
 * 首启幂等入口：仅「全新空库」（无迁移数据、无任何模板）才播全套默认模板，播种后写标记。
 *
 * 触发时机晚于迁移（见 db.ts）：若迁移已带入模板、或管理员已自建模板，库非空 →
 * 不播默认模板（避免污染既有数据），仅写标记以跳过后续判断。
 */
export function ensureBuiltinSeeded(): BuiltinSeedResult {
  // 已播种标记存在 → 跳过。
  if (getSetting(SETTING_KEYS.builtinSeeded))
    return { created: [], skipped: true }
  // 库非空（迁移带入 / 已自建）→ 不播全套默认模板，仅写标记。
  if (listDefs().length > 0) {
    setSetting(SETTING_KEYS.builtinSeeded, new Date().toISOString())
    return { created: [], skipped: true }
  }
  const result = seedBuiltinTemplates()
  setSetting(SETTING_KEYS.builtinSeeded, new Date().toISOString())
  return result
}
