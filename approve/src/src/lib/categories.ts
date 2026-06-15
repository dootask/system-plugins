// 模板分类分组：用于「发起申请」宫格按组归类（假勤/行政/财务/人事/其他）。
// proc_def.category 既可能是分组码（新模板直接选分组），也可能是旧的细分码
// （迁移/内置：vacate/overtime/travel/reimburse/review/custom），统一映射到分组。

export interface CategoryGroup {
  code: string
  label: string
}

export const CATEGORY_GROUPS: ReadonlyArray<CategoryGroup> = [
  { code: 'attendance', label: '假勤' },
  { code: 'admin', label: '行政' },
  { code: 'finance', label: '财务' },
  { code: 'hr', label: '人事' },
  { code: 'other', label: '其他' },
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

export function groupLabel(code: string): string {
  return CATEGORY_GROUPS.find((g) => g.code === code)?.label ?? '其他'
}
