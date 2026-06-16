import type { MsgEntry } from '#/lib/i18n/messages/entry'

// 通用 UI 组件词条（面包屑来源名、状态标签、日期/时间选择器、分页、表情选择器、管理分段）。
export const uiMisc = {
  // 子页面包屑「来源」（顶层路由）显示名。
  'ui.crumb.start': { zh: '发起申请', en: 'New Request' },
  'ui.crumb.todo': { zh: '待处理', en: 'To Do' },
  'ui.crumb.done': { zh: '已处理', en: 'Done' },
  'ui.crumb.cc': { zh: '抄送我的', en: 'CC to Me' },
  'ui.crumb.mine': { zh: '已提交', en: 'Submitted' },
  'ui.crumb.stats': { zh: '数据统计', en: 'Statistics' },
  'ui.crumb.admin': { zh: '模板管理', en: 'Templates' },
  'ui.crumb.backup': { zh: '数据备份', en: 'Backup' },

  // 流程实例状态标签。
  'ui.status.draft': { zh: '草稿', en: 'Draft' },
  'ui.status.running': { zh: '审批中', en: 'In Progress' },
  'ui.status.approved': { zh: '已通过', en: 'Approved' },
  'ui.status.rejected': { zh: '已拒绝', en: 'Rejected' },
  'ui.status.withdrawn': { zh: '已撤回', en: 'Withdrawn' },
  'ui.status.archived': { zh: '已归档', en: 'Archived' },

  // 日期 / 时间选择器。
  'ui.date.pick': { zh: '选择日期', en: 'Pick a date' },
  'ui.date.pickRange': { zh: '选择日期范围', en: 'Pick a date range' },
  'ui.time.pick': { zh: '选择时间', en: 'Pick a time' },
  'ui.time.label': { zh: '时间', en: 'Time' },
  'ui.time.ok': { zh: '确定', en: 'OK' },

  // 分页。
  'ui.pager.total': { zh: '共 {n} 条', en: '{n} total' },
  'ui.pager.perPage': { zh: '{n} 条/页', en: '{n} / page' },
  'ui.pager.prev': { zh: '上一页', en: 'Previous' },
  'ui.pager.next': { zh: '下一页', en: 'Next' },

  // 表情选择器。
  'ui.emoji.default': { zh: '默认图标', en: 'Default icon' },
} satisfies Record<string, MsgEntry>
