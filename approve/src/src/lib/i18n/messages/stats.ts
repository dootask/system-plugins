import type { MsgEntry } from '#/lib/i18n/messages/entry'

// 数据统计页词条。
export const stats = {
  'stats.title': { zh: '数据统计', en: 'Statistics' },
  'stats.scope.all': { zh: '全部审批单', en: 'All approvals' },
  'stats.scope.mine': { zh: '我发起的审批单', en: 'My approvals' },
  'stats.scope.suffix': { zh: '统计', en: ' statistics' },
  'stats.export': { zh: '导出审批', en: 'Export Approvals' },
  'stats.loadFailed': { zh: '加载失败', en: 'Failed to load' },

  // 状态标签
  'stats.status.draft': { zh: '草稿', en: 'Draft' },
  'stats.status.running': { zh: '审批中', en: 'In Review' },
  'stats.status.approved': { zh: '已通过', en: 'Approved' },
  'stats.status.rejected': { zh: '已拒绝', en: 'Rejected' },
  'stats.status.withdrawn': { zh: '已撤回', en: 'Withdrawn' },
  'stats.status.archived': { zh: '已归档', en: 'Archived' },

  // 统计卡片
  'stats.card.total': { zh: '总数', en: 'Total' },
  'stats.card.todo': { zh: '待我审批', en: 'Awaiting My Review' },

  // 导出弹窗
  'stats.export.title': { zh: '导出审批数据', en: 'Export Approval Data' },
  'stats.export.desc': {
    zh: '按条件筛选后导出为 Excel（XLSX）。选定具体模板时会额外导出该模板的表单字段列。',
    en: 'Export to Excel (XLSX) after filtering. Selecting a specific template also exports that template’s form field columns.',
  },
  'stats.export.from': { zh: '发起起始日', en: 'Start Date' },
  'stats.export.to': { zh: '发起截止日', en: 'End Date' },
  'stats.export.datePlaceholder': { zh: '不限', en: 'Any' },
  'stats.export.statusLabel': {
    zh: '状态（不选 = 全部）',
    en: 'Status (none = all)',
  },
  'stats.export.templateLabel': { zh: '模板', en: 'Template' },
  'stats.export.allTemplates': { zh: '全部模板', en: 'All templates' },
  'stats.export.templateHint': {
    zh: '将额外导出该模板的表单字段列。',
    en: 'Will additionally export this template’s form field columns.',
  },
  'stats.export.keywordLabel': { zh: '标题关键字', en: 'Title Keyword' },
  'stats.export.keywordPlaceholder': {
    zh: '可选，模糊匹配标题',
    en: 'Optional, fuzzy match on title',
  },
  'stats.export.submit': { zh: '导出 Excel', en: 'Export Excel' },
  'stats.export.empty': {
    zh: '当前筛选无匹配的审批单',
    en: 'No approvals match the current filters',
  },
  'stats.export.limitWarn': {
    zh: '共匹配 {total} 条，将只导出最近 {limit} 条。是否继续？',
    en: '{total} matched, only the latest {limit} will be exported. Continue?',
  },
  'stats.export.failed': { zh: '导出失败', en: 'Export failed' },
  'stats.export.fileName': { zh: '审批数据', en: 'ApprovalData' },
} satisfies Record<string, MsgEntry>
