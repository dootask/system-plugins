import type { MsgEntry } from '#/lib/i18n/messages/entry'

// 列表域：审批单列表 / 模板列表 / 发起申请宫格 / 发起表单。
export const lists = {
  // 审批单列表（todo/done/mine/cc）
  'inst.title.todo': { zh: '待处理', en: 'To Do' },
  'inst.title.done': { zh: '已处理', en: 'Done' },
  'inst.title.mine': { zh: '已提交', en: 'Submitted' },
  'inst.title.cc': { zh: '抄送我的', en: 'CC to Me' },

  'inst.emptyHint.todo': {
    zh: '当前没有需要你审批的单据',
    en: 'No approvals waiting for you',
  },
  'inst.emptyHint.done': {
    zh: '你还没有处理过任何审批单',
    en: "You haven't processed any approvals yet",
  },
  'inst.emptyHint.mine': {
    zh: '在「发起申请」中选择模板开始一个新流程',
    en: 'Pick a template in "New Request" to start a new process',
  },
  'inst.emptyHint.cc': {
    zh: '暂时没有抄送给你的单据',
    en: 'No items have been CC’d to you',
  },
  'inst.empty': { zh: '暂无审批单', en: 'No approvals' },

  'inst.searchPlaceholder': { zh: '搜索标题', en: 'Search title' },
  'inst.filterByStatus': { zh: '按状态筛选', en: 'Filter by status' },
  'inst.allStatus': { zh: '全部状态', en: 'All statuses' },

  'inst.status.running': { zh: '审批中', en: 'In Review' },
  'inst.status.approved': { zh: '已通过', en: 'Approved' },
  'inst.status.rejected': { zh: '已拒绝', en: 'Rejected' },
  'inst.status.withdrawn': { zh: '已撤回', en: 'Withdrawn' },
  'inst.status.archived': { zh: '已归档', en: 'Archived' },

  'inst.col.title': { zh: '标题', en: 'Title' },
  'inst.col.template': { zh: '模板', en: 'Template' },
  'inst.col.status': { zh: '状态', en: 'Status' },
  'inst.col.initiator': { zh: '发起人', en: 'Initiator' },
  'inst.col.submittedAt': { zh: '提交时间', en: 'Submitted At' },
  'inst.templateFallback': { zh: '模板#{id}', en: 'Template #{id}' },

  'inst.loadFailed': { zh: '加载失败', en: 'Failed to load' },

  // 模板列表（管理）
  'tpl.searchPlaceholder': { zh: '搜索模板名称', en: 'Search template name' },
  'tpl.filterByStatus': { zh: '按状态筛选', en: 'Filter by status' },
  'tpl.create': { zh: '新建模板', en: 'New Template' },
  'tpl.statusEnabled': { zh: '启用', en: 'Enabled' },
  'tpl.statusDisabled': { zh: '停用', en: 'Disabled' },
  'tpl.empty': { zh: '暂无模板', en: 'No templates' },
  'tpl.emptyHint': {
    zh: '点击「新建模板」开始配置',
    en: 'Click "New Template" to start configuring',
  },

  'tpl.col.template': { zh: '模板', en: 'Template' },
  'tpl.col.status': { zh: '状态', en: 'Status' },
  'tpl.col.version': { zh: '版本', en: 'Version' },
  'tpl.col.updatedAt': { zh: '更新时间', en: 'Updated At' },

  'tpl.action.enable': { zh: '启用', en: 'Enable' },
  'tpl.action.disable': { zh: '停用', en: 'Disable' },

  'tpl.deleteConfirm': {
    zh: '确认删除模板「{name}」？已发起的审批单不受影响。',
    en: 'Delete template "{name}"? Existing approvals are not affected.',
  },
  'tpl.deleteTitle': { zh: '删除模板', en: 'Delete Template' },
  'tpl.toggleFailed': { zh: '操作失败', en: 'Operation failed' },
  'tpl.deleteFailed': { zh: '删除失败', en: 'Failed to delete' },
  'tpl.loadFailed': { zh: '加载失败', en: 'Failed to load' },

  // 发起申请宫格
  'start.searchPlaceholder': { zh: '搜索模板名称', en: 'Search template name' },
  'start.filterByCategory': { zh: '按分类筛选', en: 'Filter by category' },
  'start.empty': { zh: '暂无可用模板', en: 'No templates available' },
  'start.emptyHintAdmin': {
    zh: '点击「审批管理」新建审批模板',
    en: 'Go to "Templates" to create an approval template',
  },
  'start.emptyHintUser': {
    zh: '请联系管理员在「审批管理」中启用或新建审批模板',
    en: 'Ask an admin to enable or create a template in "Templates"',
  },
  'start.createHintPrefix': {
    zh: '若未找到合适的模板，可',
    en: "Can't find a suitable template?",
  },
  'start.createTemplate': { zh: '创建审批模板', en: 'Create Template' },
  'start.loadFailed': { zh: '加载模板失败', en: 'Failed to load templates' },

  // 发起表单
  'startForm.submitting': { zh: '提交中…', en: 'Submitting…' },
  'startForm.loadFailed': {
    zh: '加载模板详情失败',
    en: 'Failed to load template detail',
  },
  'startForm.submitFailed': { zh: '提交失败', en: 'Failed to submit' },
} satisfies Record<string, MsgEntry>
