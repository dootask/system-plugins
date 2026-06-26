import type { MsgEntry } from '#/lib/i18n/messages/entry'

// 服务端：接口错误（badRequest/notFound/forbidden 等）+ 机器人通知卡片文案。
// 这些按「触发请求的用户语言」渲染（serverT(request)）。
export const server = {
  // —— 通用接口错误 ——
  'server.err.missingDefIdParam': { zh: '缺少 defId', en: 'Missing defId' },
  'server.err.missingDefId': { zh: '缺少模板 id', en: 'Missing template id' },
  'server.err.defNotFound': { zh: '模板不存在', en: 'Template not found' },
  'server.err.defDisabled': {
    zh: '该模板已停用，无法发起',
    en: 'This template is disabled and cannot be used',
  },
  'server.err.formInvalid': {
    zh: '表单校验未通过',
    en: 'Form validation failed',
  },
  'server.err.startFailed': { zh: '发起失败', en: 'Failed to submit request' },
  'server.err.missingInstId': {
    zh: '缺少审批单 id',
    en: 'Missing approval id',
  },
  'server.err.instNotFound': {
    zh: '审批单不存在',
    en: 'Approval not found',
  },
  'server.err.noViewPerm': {
    zh: '无权查看该审批单',
    en: 'You are not allowed to view this approval',
  },
  'server.err.noCommentPerm': {
    zh: '无权评论该审批单',
    en: 'You are not allowed to comment on this approval',
  },
  'server.err.emptyComment': {
    zh: '评论内容不能为空',
    en: 'Comment cannot be empty',
  },

  // —— 模板管理 ——
  'server.err.adminOnlyTemplates': {
    zh: '仅管理员可管理模板',
    en: 'Only administrators can manage templates',
  },
  'server.err.missingDefName': {
    zh: '缺少模板名称',
    en: 'Missing template name',
  },
  'server.err.badBody': { zh: '请求体无效', en: 'Invalid request body' },
  'server.err.emptyDefName': {
    zh: '模板名称不能为空',
    en: 'Template name cannot be empty',
  },

  // —— 任务处置 ——
  'server.err.missingTaskId': { zh: '缺少任务 id', en: 'Missing task id' },
  'server.err.taskNotFound': { zh: '任务不存在', en: 'Task not found' },
  'server.err.badAction': { zh: '非法 action', en: 'Invalid action' },
  'server.err.withdrawOwnOnly': {
    zh: '只能撤回本人发起的审批',
    en: 'You can only withdraw approvals you started',
  },
  'server.err.notPendingApprover': {
    zh: '您不是当前待审人或已处理过',
    en: 'You are not a current approver or have already acted',
  },
  'server.err.actFailed': { zh: '操作失败', en: 'Operation failed' },
  'server.err.resubmitInitiatorOnly': {
    zh: '仅发起人可重新提交',
    en: 'Only the initiator can resubmit',
  },
  'server.err.resubmitFailed': {
    zh: '重新提交失败',
    en: 'Failed to resubmit',
  },

  // —— 上传 / 备份 ——
  'server.err.useMultipart': {
    zh: '请用 multipart/form-data 上传',
    en: 'Please upload using multipart/form-data',
  },
  'server.err.missingFileField': {
    zh: '缺少文件字段 file',
    en: 'Missing "file" field',
  },
  'server.err.fileTooLarge': {
    zh: '文件超过 20MB 上限',
    en: 'File exceeds the 20MB limit',
  },
  'server.err.fileNotFound': { zh: '文件不存在', en: 'File not found' },
  'server.err.adminOnly': {
    zh: '仅管理员可操作',
    en: 'Administrators only',
  },
  'server.err.noPresetSelected': {
    zh: '请至少选择一个预设模板',
    en: 'Please select at least one preset template',
  },
  'server.err.backupNotFound': {
    zh: '备份不存在',
    en: 'Backup not found',
  },

  // —— 主程序对接（上传/连接） ——
  'server.err.uploadNoCred': {
    zh: '缺少用户凭据，无法上传',
    en: 'Missing user credentials; cannot upload',
  },
  'server.err.hostUnreachable': {
    zh: '无法连接主程序',
    en: 'Cannot reach the main app',
  },
  'server.err.uploadFailed': {
    zh: '上传失败 ({status})',
    en: 'Upload failed ({status})',
  },
  'server.err.uploadNoId': {
    zh: '上传失败：未返回文件 id',
    en: 'Upload failed: no file id returned',
  },

  // —— 通知卡片（审批机器人推送） ——
  'server.week.0': { zh: '周日', en: 'Sun' },
  'server.week.1': { zh: '周一', en: 'Mon' },
  'server.week.2': { zh: '周二', en: 'Tue' },
  'server.week.3': { zh: '周三', en: 'Wed' },
  'server.week.4': { zh: '周四', en: 'Thu' },
  'server.week.5': { zh: '周五', en: 'Fri' },
  'server.week.6': { zh: '周六', en: 'Sat' },

  'server.notify.viewDetail': {
    zh: '查看详情：点击查看审批详情',
    en: 'View details: tap to open the approval',
  },
  'server.notify.applicant': {
    zh: '- 申请人：{name}',
    en: '- Applicant: {name}',
  },
  'server.notify.type': { zh: '- 类型：{value}', en: '- Type: {value}' },
  'server.notify.start': { zh: '- 开始：{value}', en: '- Start: {value}' },
  'server.notify.end': { zh: '- 结束：{value}', en: '- End: {value}' },
  'server.notify.reason': { zh: '- 事由：{value}', en: '- Reason: {value}' },
  'server.notify.status': { zh: '- 状态：{value}', en: '- Status: {value}' },
  'server.notify.handler': {
    zh: '- 处理人：{name}',
    en: '- Handled by: {name}',
  },
  'server.notify.approved': { zh: '已通过', en: 'Approved' },
  'server.notify.rejected': { zh: '已拒绝', en: 'Rejected' },
  'server.notify.toReview': {
    zh: '{applicant} 提交的「{defName}」待你审批',
    en: '"{defName}" from {applicant} awaits your approval',
  },
  'server.notify.cc': {
    zh: '抄送你：{applicant} 提交的「{defName}」',
    en: 'CC to you: "{defName}" from {applicant}',
  },
  'server.notify.resultApproved': {
    zh: '你发起的「{defName}」已通过',
    en: 'Your "{defName}" has been approved',
  },
  'server.notify.resultRejected': {
    zh: '你发起的「{defName}」被拒绝',
    en: 'Your "{defName}" was rejected',
  },

  // —— 鉴权 ——
  'server.err.missingCred': {
    zh: '缺少用户凭据',
    en: 'Missing user credentials',
  },
  'server.err.invalidCred': {
    zh: '凭据无效或已过期',
    en: 'Credentials are invalid or expired',
  },
  'server.err.missingId': { zh: '缺少 id', en: 'Missing id' },

  // —— 审批数据导出（XLSX，管理员） ——
  'server.export.adminOnly': {
    zh: '仅管理员可导出审批数据',
    en: 'Only administrators can export approval data',
  },
  'server.export.sheet': { zh: '审批数据', en: 'Approval Data' },
  'server.export.status.draft': { zh: '草稿', en: 'Draft' },
  'server.export.status.running': { zh: '审批中', en: 'In Review' },
  'server.export.status.approved': { zh: '已通过', en: 'Approved' },
  'server.export.status.rejected': { zh: '已拒绝', en: 'Rejected' },
  'server.export.status.withdrawn': { zh: '已撤回', en: 'Withdrawn' },
  'server.export.status.archived': { zh: '已归档', en: 'Archived' },
  'server.export.decision.approve': { zh: '通过', en: 'Approved' },
  'server.export.decision.reject': { zh: '拒绝', en: 'Rejected' },
  'server.export.decision.return': { zh: '退回', en: 'Returned' },
  'server.export.decision.withdraw': { zh: '撤回', en: 'Withdrawn' },
  'server.export.decision.archive': { zh: '归档', en: 'Archived' },
  'server.export.dur.day': { zh: '{n}天', en: '{n}d' },
  'server.export.dur.hour': { zh: '{n}小时', en: '{n}h' },
  'server.export.dur.min': { zh: '{n}分', en: '{n}m' },
  'server.export.h.id': { zh: '单号', en: 'No.' },
  'server.export.h.title': { zh: '标题', en: 'Title' },
  'server.export.h.template': { zh: '模板', en: 'Template' },
  'server.export.h.category': { zh: '分类', en: 'Category' },
  'server.export.h.initiator': { zh: '发起人', en: 'Initiator' },
  'server.export.h.dept': { zh: '发起部门', en: 'Department' },
  'server.export.h.status': { zh: '状态', en: 'Status' },
  'server.export.h.createdAt': { zh: '发起时间', en: 'Submitted At' },
  'server.export.h.finishedAt': { zh: '结束时间', en: 'Finished At' },
  'server.export.h.duration': { zh: '耗时', en: 'Duration' },
  'server.export.h.lastHandler': { zh: '末次处理', en: 'Last Handler' },
  'server.export.h.lastComment': { zh: '末次意见', en: 'Last Comment' },
  'server.export.deptFallback': { zh: '部门#{id}', en: 'Dept #{id}' },
  'server.export.userFallback': { zh: '用户#{id}', en: 'User #{id}' },
  'server.export.tableRows': { zh: '{n} 行', en: '{n} rows' },
  'server.export.decisionWrap': {
    zh: '{name}（{decision}）',
    en: '{name} ({decision})',
  },
} satisfies Record<string, MsgEntry>
