// 模板分类分组：用于「发起申请」宫格按组归类（假勤/行政/财务/人事/其他）。
// proc_def.category 既可能是分组码（新模板直接选分组），也可能是旧的细分码
// （迁移/内置：vacate/overtime/travel/reimburse/review/custom），统一映射到分组。

import type { MsgKey } from '#/lib/i18n/messages'

export interface CategoryGroup {
  code: string
  /** 分组名词条 key，渲染时由调用方用 t(labelKey) 取译文。 */
  labelKey: MsgKey
}

export const CATEGORY_GROUPS: ReadonlyArray<CategoryGroup> = [
  { code: 'attendance', labelKey: 'category.attendance' },
  { code: 'admin', labelKey: 'category.admin' },
  { code: 'finance', labelKey: 'category.finance' },
  { code: 'hr', labelKey: 'category.hr' },
  { code: 'other', labelKey: 'category.other' },
]

const GROUP_CODES = new Set(CATEGORY_GROUPS.map((g) => g.code))

// 旧细分类目 → 分组。
const FINE_TO_GROUP: Record<string, string> = {
  vacate: 'attendance',
  overtime: 'attendance',
  travel: 'attendance',
  外出: 'attendance',
  reimburse: 'finance',
  expense: 'finance',
  review: 'other',
  custom: 'other',
}

/** 把模板的 category 归一化到分组码，未知归入 other。 */
export function groupOf(category: string | null | undefined): string {
  if (!category) return 'other'
  if (GROUP_CODES.has(category)) return category
  return FINE_TO_GROUP[category] ?? 'other'
}

/** 分组码 → 分组名词条 key（未知归入 other）。调用方用 t(...) 取译文。 */
export function groupLabelKey(code: string): MsgKey {
  return CATEGORY_GROUPS.find((g) => g.code === code)?.labelKey ?? 'category.other'
}
