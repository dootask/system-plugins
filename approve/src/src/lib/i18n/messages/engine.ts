import type { MsgEntry } from '#/lib/i18n/messages/entry'

// 审批引擎 / 流程结构校验抛出的错误文案。引擎以 EngineError(key, params) 抛出，
// 在 handler 边界按请求语言翻译；validateFlowTree 直接收 t 返回译文。
export const engine = {
  'engine.defMissing': {
    zh: '流程定义 {id} 不存在',
    en: 'Flow definition {id} not found',
  },
  'engine.defDisabled': {
    zh: '该流程已停用，无法发起',
    en: 'This flow is disabled and cannot be used',
  },
  'engine.instNotFound': { zh: '审批单不存在', en: 'Approval not found' },
  'engine.instFinished': {
    zh: '审批单已结束，无法操作',
    en: 'This approval has ended and cannot be modified',
  },
  'engine.badAction': {
    zh: '不支持的动作: {action}',
    en: 'Unsupported action: {action}',
  },
  'engine.archiveApprovedOnly': {
    zh: '仅通过的审批单可归档',
    en: 'Only approved requests can be archived',
  },
  'engine.resubmitReturnedOnly': {
    zh: '仅退回待发起人修改的单可重新提交',
    en: 'Only requests returned for revision can be resubmitted',
  },
  'engine.defNotFound': {
    zh: '流程定义不存在',
    en: 'Flow definition not found',
  },
  'engine.noActiveTask': { zh: '当前无待办任务', en: 'No pending task' },
  'engine.withdrawOwnOnly': {
    zh: '只能撤回本人发起的审批',
    en: 'You can only withdraw approvals you started',
  },
  'engine.withdrawAtStart': {
    zh: '开始位置无法撤回',
    en: 'Cannot withdraw at the start',
  },
  'engine.withdrawFinished': {
    zh: '已审批结束，无法撤回',
    en: 'Already completed; cannot withdraw',
  },
  'engine.withdrawActed': {
    zh: '已有人审批，无法撤回',
    en: 'Someone has already approved; cannot withdraw',
  },
  'engine.transferNeedTarget': {
    zh: 'transfer 需要 transferTo',
    en: 'transfer requires transferTo',
  },
  'engine.addsignNeedTarget': {
    zh: 'addsign 需要 addsignTo',
    en: 'addsign requires addsignTo',
  },
  'engine.notPending': {
    zh: '您不是当前待审人或已处理过',
    en: 'You are not a current approver or have already acted',
  },

  // —— 流程结构校验（validateFlowTree / expandFlow） ——
  'engine.flow.invalid': {
    zh: '流程结构无效',
    en: 'Invalid flow structure',
  },
  'engine.flow.rootMustStart': {
    zh: '流程根节点必须是发起人（start）',
    en: 'The flow root must be the initiator (start)',
  },
  'engine.flow.noApprover': {
    zh: '节点【{name}】未指定审批人',
    en: 'Node "{name}" has no approver assigned',
  },
  'engine.flow.noNotifier': {
    zh: '节点【{name}】未指定抄送人',
    en: 'Node "{name}" has no CC recipient assigned',
  },
  'engine.flow.noRole': {
    zh: '节点【{name}】未指定角色',
    en: 'Node "{name}" has no role assigned',
  },
  'engine.flow.badLeaderLevel': {
    zh: '节点【{name}】主管层级非法',
    en: 'Node "{name}" has an invalid manager level',
  },
  'engine.flow.routeMinBranches': {
    zh: '条件分支至少需要两个分支',
    en: 'A conditional branch needs at least two branches',
  },
  'engine.flow.routeNeedDefault': {
    zh: '条件分支需有一个默认（无条件）兜底分支',
    en: 'A conditional branch needs one default (unconditional) fallback',
  },
  'engine.flow.needApprover': {
    zh: '流程至少需要一个审批节点',
    en: 'The flow needs at least one approval node',
  },
  'engine.flow.noMatchBranch': {
    zh: '流程节点【{nodeId}】找不到符合条件的分支',
    en: 'Flow node "{nodeId}" has no matching branch',
  },
} satisfies Record<string, MsgEntry>
