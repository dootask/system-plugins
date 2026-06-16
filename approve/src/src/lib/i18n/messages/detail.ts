import type { MsgEntry } from '#/lib/i18n/messages/entry'

// 审批详情页词条（标题、流程进度、操作区、时间线、状态/动作标签）。
export const detail = {
  // 页面标题 / 面包屑。
  'detail.title': { zh: '审批详情 #{id}', en: 'Approval Detail #{id}' },
  'detail.notFound': { zh: '审批单不存在', en: 'Approval not found' },
  'detail.loadFailed': { zh: '加载失败', en: 'Failed to load' },
  'detail.invalidId': { zh: '无效的审批单 id', en: 'Invalid approval id' },

  // 区块标题。
  'detail.section.form': { zh: '表单内容', en: 'Form' },
  'detail.section.progress': { zh: '流程进度', en: 'Progress' },
  'detail.section.action': { zh: '操作', en: 'Action' },
  'detail.section.timeline': { zh: '流程时间线', en: 'Timeline' },

  // 退回提示与操作。
  'detail.returnedHint': {
    zh: '审批单已退回，请修改后重新提交。',
    en: 'This request was returned. Please revise and resubmit.',
  },
  'detail.commentPlaceholder': {
    zh: '填写审批意见 / 评论（可选）',
    en: 'Enter comment (optional)',
  },

  // 操作按钮。
  'detail.act.approve': { zh: '同意', en: 'Approve' },
  'detail.act.reject': { zh: '拒绝', en: 'Reject' },
  'detail.act.return': { zh: '退回', en: 'Return' },
  'detail.act.transfer': { zh: '转交', en: 'Transfer' },
  'detail.act.addsign': { zh: '加签', en: 'Add Approver' },
  'detail.act.withdraw': { zh: '撤回', en: 'Withdraw' },
  'detail.act.resubmit': { zh: '重新提交', en: 'Resubmit' },
  'detail.act.commentOnly': { zh: '仅评论', en: 'Comment Only' },
  'detail.noAction': {
    zh: '你当前无可执行的审批操作，可留言评论。',
    en: 'No approval action available; you can leave a comment.',
  },

  // 确认弹窗。
  'detail.confirm.withdraw': {
    zh: '确认撤回该审批单？撤回后流程结束，不可恢复。',
    en: 'Withdraw this request? The process will end and cannot be restored.',
  },
  'detail.confirm.withdrawTitle': { zh: '撤回审批单', en: 'Withdraw Request' },
  'detail.confirm.reject': {
    zh: '确认拒绝该审批？',
    en: 'Reject this approval?',
  },
  'detail.confirm.rejectTitle': { zh: '拒绝审批', en: 'Reject Approval' },
  'detail.confirm.return': {
    zh: '确认退回给发起人修改？',
    en: 'Return to the applicant for revision?',
  },
  'detail.confirm.returnTitle': { zh: '退回修改', en: 'Return for Revision' },

  // 操作失败回退提示。
  'detail.error.action': { zh: '操作失败', en: 'Action failed' },
  'detail.error.withdraw': { zh: '撤回失败', en: 'Failed to withdraw' },
  'detail.error.resubmit': { zh: '重新提交失败', en: 'Failed to resubmit' },
  'detail.error.comment': { zh: '评论失败', en: 'Failed to comment' },
  'detail.error.commentEmpty': {
    zh: '请先填写评论内容或添加图片',
    en: 'Please enter a comment or add an image first',
  },
  'detail.error.uploadFailed': {
    zh: '「{name}」上传失败',
    en: 'Failed to upload "{name}"',
  },

  // 图片输入。
  'detail.image.add': { zh: '添加图片', en: 'Add Image' },
  'detail.image.remove': { zh: '移除', en: 'Remove' },

  // 时间线。
  'detail.timeline.empty': { zh: '暂无记录', en: 'No records' },

  // 事件标签（时间线动作）。
  'detail.event.submit': { zh: '发起', en: 'Submitted' },
  'detail.event.approve': { zh: '通过', en: 'Approved' },
  'detail.event.reject': { zh: '拒绝', en: 'Rejected' },
  'detail.event.return': { zh: '退回', en: 'Returned' },
  'detail.event.withdraw': { zh: '撤回', en: 'Withdrew' },
  'detail.event.transfer': { zh: '转交', en: 'Transferred' },
  'detail.event.addsign': { zh: '加签', en: 'Added Approver' },
  'detail.event.comment': { zh: '评论', en: 'Commented' },
  'detail.event.archive': { zh: '归档', en: 'Archived' },

  // 参与人处理状态标签。
  'detail.action.pending': { zh: '待处理', en: 'Pending' },
  'detail.action.approved': { zh: '已同意', en: 'Approved' },
  'detail.action.rejected': { zh: '已拒绝', en: 'Rejected' },
  'detail.action.returned': { zh: '已退回', en: 'Returned' },
  'detail.action.withdrawn': { zh: '已撤回', en: 'Withdrawn' },
  'detail.action.skipped': { zh: '未处理', en: 'Not Handled' },

  // 审批方式标签。
  'detail.mode.or': { zh: '或签', en: 'Any One' },
  'detail.mode.cosign': { zh: '会签', en: 'All' },
  'detail.mode.sequence': { zh: '依次', en: 'Sequential' },

  // 流程节点标题 / 备注。
  'detail.node.start': { zh: '发起', en: 'Submit' },
  'detail.node.notifier': { zh: '抄送', en: 'CC' },
  'detail.node.approve': { zh: '审批', en: 'Approval' },
  'detail.node.end': { zh: '结束', en: 'End' },
  'detail.node.autoApprove': { zh: '自动通过', en: 'Auto-approved' },

  // 结束节点结果备注（按实例运行态）。
  'detail.end.returned': { zh: '退回待修改', en: 'Returned for Revision' },
  'detail.end.running': { zh: '审批中', en: 'In Progress' },
  'detail.end.approved': { zh: '已通过', en: 'Approved' },
  'detail.end.rejected': { zh: '已拒绝', en: 'Rejected' },
  'detail.end.withdrawn': { zh: '已撤回', en: 'Withdrawn' },
} satisfies Record<string, MsgEntry>
