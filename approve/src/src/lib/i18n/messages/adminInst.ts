import type { MsgEntry } from './entry'

export const adminInst = {
  'adminInst.title': { zh: '审批管理', en: 'Approval Management' },
  'adminInst.emptyHint': {
    zh: '暂无符合条件的审批',
    en: 'No matching approvals',
  },
  'adminInst.adminOnly': {
    zh: '仅审批管理员可操作',
    en: 'Approval administrators only',
  },
  'adminInst.void': { zh: '作废审批', en: 'Void Approval' },
  'adminInst.voided': { zh: '已作废', en: 'Voided' },
  'adminInst.voidEvent': { zh: '作废了审批', en: 'Voided the approval' },
  'adminInst.confirm': {
    zh: '确认作废“{title}”？作废后不能恢复流转，表单、附件与审批历史仍会保留。',
    en: 'Void "{title}"? This cannot be resumed. The form, attachments and approval history will be retained.',
  },
  'adminInst.reason': { zh: '作废原因', en: 'Reason for voiding' },
  'adminInst.effectiveTotal': {
    zh: '有效审批总数',
    en: 'Total Non-Voided Approvals',
  },
  'adminInst.exportDefault': {
    zh: '默认不含已作废审批',
    en: 'Voided approvals excluded by default',
  },
  'engine.voidUnfinishedOnly': {
    zh: '只能作废未结束的审批，请刷新后重试',
    en: 'Only unfinished approvals can be voided. Refresh and try again.',
  },
  'engine.voidReasonRequired': {
    zh: '请填写作废原因，最多 1000 个字符',
    en: 'A reason is required (maximum 1,000 characters).',
  },
} satisfies Record<string, MsgEntry>
