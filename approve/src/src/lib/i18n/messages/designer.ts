import type { MsgEntry } from '#/lib/i18n/messages/entry'

// 设计器（表单设计 + 流程设计）：节点/字段类型名、设置类型、审批方式、条件运算符、面板文案。
export const designer = {
  // 字段类型名（表单设计器字段类型按钮 / 子表列类型下拉）。
  'designer.field.text': { zh: '单行文本', en: 'Single-line Text' },
  'designer.field.textarea': { zh: '多行文本', en: 'Multi-line Text' },
  'designer.field.number': { zh: '数字', en: 'Number' },
  'designer.field.money': { zh: '金额', en: 'Amount' },
  'designer.field.date': { zh: '日期', en: 'Date' },
  'designer.field.datetime': { zh: '日期时间', en: 'Date & Time' },
  'designer.field.daterange': { zh: '日期范围', en: 'Date Range' },
  'designer.field.select': { zh: '单选下拉', en: 'Dropdown' },
  'designer.field.multiselect': { zh: '多选', en: 'Multi-select' },
  'designer.field.user': { zh: '人员', en: 'Member' },
  'designer.field.dept': { zh: '部门', en: 'Department' },
  'designer.field.table': { zh: '明细子表', en: 'Sub-table' },
  'designer.field.file': { zh: '附件', en: 'File' },
  'designer.field.desc': { zh: '说明文字', en: 'Description' },

  // 默认值（新建字段/选项/列时的占位文案）。
  'designer.default.optionFirst': { zh: '选项一', en: 'Option 1' },
  'designer.default.optionSecond': { zh: '选项二', en: 'Option 2' },
  'designer.default.option': { zh: '选项{n}', en: 'Option {n}' },
  'designer.default.columnFirst': { zh: '列一', en: 'Column 1' },
  'designer.default.column': { zh: '列{n}', en: 'Column {n}' },

  // 流程节点默认名。
  'designer.node.approver': { zh: '审批人', en: 'Approver' },
  'designer.node.cc': { zh: '抄送人', en: 'CC' },
  'designer.node.route': { zh: '条件分支', en: 'Condition Branch' },
  'designer.node.initiator': { zh: '发起人', en: 'Initiator' },

  // 条件分支默认分支名。
  'designer.branch.first': { zh: '条件一', en: 'Condition 1' },
  'designer.branch.other': { zh: '其他情况', en: 'Otherwise' },
  'designer.branch.n': { zh: '条件{n}', en: 'Condition {n}' },

  // 设置类型（审批人/抄送人来源）。
  'designer.settype.specific': { zh: '指定成员', en: 'Specific Members' },
  'designer.settype.role': { zh: '指定角色', en: 'Specific Roles' },
  'designer.settype.leader': {
    zh: '部门主管/连续多级主管',
    en: 'Department Manager / Multi-level',
  },
  'designer.settype.selfSelect': { zh: '发起人自选', en: 'Initiator Selects' },
  'designer.settype.initiator': { zh: '发起人自己', en: 'Initiator' },

  // 审批方式。
  'designer.mode.or': { zh: '或签（一人通过即可）', en: 'Any One (one approval)' },
  'designer.mode.cosign': {
    zh: '会签（须全部通过）',
    en: 'All Must (everyone approves)',
  },
  'designer.mode.sequence': { zh: '依次审批', en: 'Sequential' },

  // 条件运算符。
  'designer.op.eq': { zh: '等于', en: '=' },
  'designer.op.ne': { zh: '不等于', en: '≠' },
  'designer.op.gt': { zh: '大于', en: '>' },
  'designer.op.gte': { zh: '大于等于', en: '≥' },
  'designer.op.lt': { zh: '小于', en: '<' },
  'designer.op.lte': { zh: '小于等于', en: '≤' },
  'designer.op.in': { zh: '属于', en: 'in' },
  'designer.op.contains': { zh: '包含', en: 'contains' },

  // ── 流程设计器画布 ──
  'designer.flow.addCondition': { zh: '添加条件', en: 'Add Condition' },
  'designer.flow.addNode': { zh: '添加节点', en: 'Add Node' },
  'designer.flow.anyoneCanStart': { zh: '所有人可发起', en: 'Anyone can start' },
  'designer.flow.selectMembers': { zh: '请选择人员', en: 'Select members' },
  'designer.flow.selectRole': { zh: '请选择角色', en: 'Select role' },
  'designer.flow.membersCount': {
    zh: '{label}（{n} 人）',
    en: '{label} ({n} people)',
  },
  'designer.flow.rolesCount': {
    zh: '指定角色（{n} 个）',
    en: 'Specific Roles ({n})',
  },
  'designer.flow.leaderLevel': {
    zh: '部门主管（到第 {n} 级）',
    en: 'Department Manager (up to level {n})',
  },
  'designer.flow.initiatorSelf': { zh: '发起人自己', en: 'Initiator' },
  'designer.flow.defaultBranch': {
    zh: '其他情况（默认分支）',
    en: 'Otherwise (default branch)',
  },
  'designer.flow.condJoin': { zh: ' 且 ', en: ' and ' },

  // 节点/分支配置抽屉。
  'designer.flow.approverSettings': { zh: '审批人设置', en: 'Approver Settings' },
  'designer.flow.ccSettings': { zh: '抄送人设置', en: 'CC Settings' },
  'designer.flow.conditionSettings': { zh: '条件设置', en: 'Condition Settings' },
  'designer.flow.nodeName': { zh: '节点名称', en: 'Node Name' },
  'designer.flow.approverSource': { zh: '审批人来源', en: 'Approver Source' },
  'designer.flow.ccSource': { zh: '抄送人来源', en: 'CC Source' },
  'designer.flow.deptManager': { zh: '部门主管', en: 'Department Manager' },
  'designer.flow.leaderHint': {
    zh: '连续多级主管：从直属主管起逐级审批到所设层级。',
    en: 'Multi-level managers: approve level by level from the direct manager up to the set level.',
  },
  'designer.flow.selectMembersLabel': { zh: '选择人员', en: 'Select Members' },
  'designer.flow.select': { zh: '选择', en: 'Select' },
  'designer.flow.leaderLevelLabel': {
    zh: '审批到第几级主管',
    en: 'Manager Level to Approve',
  },
  'designer.flow.directManager': { zh: '直属主管', en: 'Direct Manager' },
  'designer.flow.managerLevelN': {
    zh: '第 {n} 级主管',
    en: 'Level {n} Manager',
  },
  'designer.flow.multiApproveMode': {
    zh: '多人审批方式',
    en: 'Multi-approver Mode',
  },
  'designer.flow.dueHours': {
    zh: '审批时限（小时，可选）',
    en: 'Time Limit (hours, optional)',
  },
  'designer.flow.roleHint': {
    zh: '角色来源暂以 identity 近似（当前版本未开放角色选择）。',
    en: 'Role source is approximated by identity (role selection is not yet available).',
  },
  'designer.flow.branchName': { zh: '分支名称', en: 'Branch Name' },
  'designer.flow.noConditionField': {
    zh: '当前表单没有可用于条件的字段（需数值/金额或单选下拉字段）。该分支将作为默认分支。',
    en: 'The form has no usable condition fields (requires a number/amount or dropdown field). This branch will be the default.',
  },
  'designer.flow.conditionsAnd': {
    zh: '条件（同时满足，AND）',
    en: 'Conditions (all must match, AND)',
  },
  'designer.flow.noConditionDefault': {
    zh: '未设条件 = 默认（兜底）分支，永远命中。',
    en: 'No condition = default (fallback) branch, always matches.',
  },
  'designer.flow.pleaseSelect': { zh: '请选择', en: 'Please select' },
  'designer.flow.addCondition2': { zh: '增加条件', en: 'Add Condition' },

  // ── 表单设计器 ──
  'designer.form.addField': { zh: '添加字段：', en: 'Add field: ' },
  'designer.form.clickToAdd': {
    zh: '点击上方按钮添加字段',
    en: 'Click a button above to add a field',
  },
  'designer.form.livePreview': { zh: '实时预览', en: 'Live Preview' },
  'designer.form.noFields': { zh: '暂无字段', en: 'No fields' },
  'designer.form.required': { zh: '必填', en: 'Required' },
  'designer.form.collapse': { zh: '收起', en: 'Collapse' },
  'designer.form.configure': { zh: '配置', en: 'Configure' },
  'designer.form.label': { zh: '标签', en: 'Label' },
  'designer.form.fieldKey': { zh: '字段标识(key)', en: 'Field Key' },
  'designer.form.descText': { zh: '说明文字', en: 'Description Text' },
  'designer.form.options': { zh: '选项', en: 'Options' },
  'designer.form.optionLabelPlaceholder': { zh: '显示文案', en: 'Display text' },
  'designer.form.optionValuePlaceholder': { zh: '值', en: 'Value' },
  'designer.form.addOption': { zh: '增加选项', en: 'Add Option' },
  'designer.form.subtableColumns': { zh: '明细子表列', en: 'Sub-table Columns' },
  'designer.form.columnNamePlaceholder': { zh: '列名', en: 'Column name' },
  'designer.form.addColumn': { zh: '增加列', en: 'Add Column' },
  'designer.form.helpText': { zh: '帮助说明（可选）', en: 'Help Text (optional)' },
  'designer.form.ruleMin': { zh: '最小值', en: 'Min Value' },
  'designer.form.ruleMax': { zh: '最大值', en: 'Max Value' },
  'designer.form.ruleMinLength': { zh: '最小长度', en: 'Min Length' },
  'designer.form.ruleMaxLength': { zh: '最大长度', en: 'Max Length' },
  'designer.form.rulePattern': {
    zh: '正则校验（可选）',
    en: 'Regex (optional)',
  },
  'designer.form.ruleMinItems': { zh: '最少选择', en: 'Min Items' },
  'designer.form.ruleMaxItems': { zh: '最多选择', en: 'Max Items' },

  // ── 模板编辑页 ──
  'designer.tpl.tabBasic': { zh: '基本信息', en: 'Basics' },
  'designer.tpl.tabForm': { zh: '表单设计', en: 'Form Design' },
  'designer.tpl.tabFlow': { zh: '流程设计', en: 'Flow Design' },
  'designer.tpl.newTemplate': { zh: '新建模板', en: 'New Template' },
  'designer.tpl.editTemplate': { zh: '编辑模板', en: 'Edit Template' },
  'designer.tpl.templateName': { zh: '模板名称', en: 'Template Name' },
  'designer.tpl.category': { zh: '分类', en: 'Category' },
  'designer.tpl.nameRequired': {
    zh: '请填写模板名称',
    en: 'Please enter a template name',
  },
  'designer.tpl.loadFailed': { zh: '加载失败', en: 'Failed to load' },
  'designer.tpl.saveFailed': { zh: '保存失败', en: 'Failed to save' },
  'designer.tpl.saving': { zh: '保存中…', en: 'Saving…' },
} satisfies Record<string, MsgEntry>
