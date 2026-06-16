import type { MsgEntry } from '#/lib/i18n/messages/entry'

// 导航骨架（侧边栏分组、底部 Tab、移动端标题栏）。
export const shell = {
  'nav.group.received': { zh: '我收到的', en: 'Received' },
  'nav.group.submitted': { zh: '我提交的', en: 'Submitted' },
  'nav.group.manage': { zh: '管理', en: 'Management' },

  'nav.start': { zh: '发起申请', en: 'New Request' },
  'nav.todo': { zh: '待处理', en: 'To Do' },
  'nav.done': { zh: '已处理', en: 'Done' },
  'nav.cc': { zh: '抄送我的', en: 'CC to Me' },
  'nav.mine': { zh: '已提交', en: 'Submitted' },
  'nav.stats': { zh: '数据统计', en: 'Statistics' },
  'nav.templates': { zh: '模板管理', en: 'Templates' },
  'nav.backup': { zh: '数据备份', en: 'Backup' },

  // 移动端底部 Tab 合并项的短标签。
  'nav.tab.myApprovals': { zh: '我审批的', en: 'My Approvals' },
  'nav.tab.manage': { zh: '管理', en: 'Manage' },

  // 移动端顶部标题栏（按当前路径）。
  'page.title.detail': { zh: '审批详情', en: 'Approval Detail' },
  'page.title.templateEdit': { zh: '模板编辑', en: 'Edit Template' },
} satisfies Record<string, MsgEntry>
