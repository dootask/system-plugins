/**
 * 内置模板导入期的「模板名」本地化。
 *
 * 范围刻意很小：仅在「模板导入」（用户主动触发、带界面语言 x-lang）写库前，把**模板名称**
 * 按目标语言翻一下，让英文用户看到/导入的是英文名。表单字段、选项、流程节点等保持模板原文
 * （中文）——模板入库后即为普通可编辑数据，管理员/用户按需改，无需在此预翻。
 *
 * 中文语言（zh / zh-CHT）保持原中文；其余语言取英文（与全局 i18n「缺译回退英文」一致）。
 * 首启播种不经过这里，全新安装仍按原中文模板。
 */
import type { Locale } from '#/lib/i18n/locale'

// 24 个内置模板名：中文 → 英文。
const BUILTIN_NAME_EN: Record<string, string> = {
  请假: 'Leave',
  出差: 'Business Trip',
  外出: 'Going Out',
  加班: 'Overtime',
  会议室预定: 'Meeting Room Booking',
  物品领用: 'Item Requisition',
  物品维修: 'Item Repair',
  用章: 'Seal Usage',
  用车: 'Vehicle Use',
  公文流转: 'Document Circulation',
  通用审批: 'General Approval',
  报销: 'Reimbursement',
  费用: 'Expense',
  付款: 'Payment',
  合同审批: 'Contract Approval',
  采购: 'Procurement',
  活动经费: 'Event Budget',
  入职申请: 'Onboarding Application',
  转正申请: 'Regularization Application',
  调动申请: 'Transfer Application',
  离职申请: 'Resignation Application',
  绩效: 'Performance',
  招聘需求: 'Recruitment Request',
  评审: 'Review',
}

/** 中文语言（保持原中文）；其余语言取英文。 */
function isChinese(locale: Locale): boolean {
  return locale === 'zh' || locale === 'zh-CHT'
}

/** 本地化模板名：中文语言原样返回；其余取英文，缺失则原样。 */
export function localizeTemplateName(name: string, locale: Locale): string {
  if (isChinese(locale)) return name
  return BUILTIN_NAME_EN[name] ?? name
}
