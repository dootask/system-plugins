import type { MsgEntry } from '#/lib/i18n/messages/entry'

// 跨页面通用词条（应用名、通用动作、通用状态、通用提示）。
export const common = {
  'app.title': { zh: '审批中心', en: 'Approval Center' },
  'app.userFallback': { zh: '用户#{id}', en: 'User #{id}' },

  'common.confirm': { zh: '确认', en: 'Confirm' },
  'common.confirmTitle': { zh: '请确认', en: 'Please confirm' },
  'common.cancel': { zh: '取消', en: 'Cancel' },
  'common.save': { zh: '保存', en: 'Save' },
  'common.delete': { zh: '删除', en: 'Delete' },
  'common.edit': { zh: '编辑', en: 'Edit' },
  'common.close': { zh: '关闭', en: 'Close' },
  'common.submit': { zh: '提交', en: 'Submit' },
  'common.loading': { zh: '加载中…', en: 'Loading…' },
  'common.empty': { zh: '暂无数据', en: 'No data' },
  'common.retry': { zh: '重试', en: 'Retry' },
  'common.back': { zh: '返回', en: 'Back' },
  'common.search': { zh: '搜索', en: 'Search' },
  'common.all': { zh: '全部', en: 'All' },

  'common.requestFailed': {
    zh: '请求失败 ({status})',
    en: 'Request failed ({status})',
  },
  'common.downloadFailed': {
    zh: '下载失败 ({status})',
    en: 'Download failed ({status})',
  },

  // 模板分类分组（发起申请宫格分组）。
  'category.attendance': { zh: '假勤', en: 'Attendance' },
  'category.admin': { zh: '行政', en: 'Administration' },
  'category.finance': { zh: '财务', en: 'Finance' },
  'category.hr': { zh: '人事', en: 'HR' },
  'category.other': { zh: '其他', en: 'Other' },
} satisfies Record<string, MsgEntry>
