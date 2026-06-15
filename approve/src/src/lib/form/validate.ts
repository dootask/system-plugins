/**
 * 表单校验（前后端双用）。前端发起页实时校验、后端 insts POST 兜底校验都调它。
 * 纯函数，无 DOM 依赖，可在 node vitest 直接测。
 */
import type {
  FieldDef,
  FieldType,
  FormErrors,
  FormSchema,
  ValidateResult,
} from './types'

/** 值是否「为空」（按类型判定，用于 required）。 */
export function isEmpty(type: FieldType, v: unknown): boolean {
  if (v === undefined || v === null) return true
  switch (type) {
    case 'text':
    case 'textarea':
      return String(v).trim() === ''
    case 'number':
    case 'money':
      return v === '' || Number.isNaN(Number(v))
    case 'date':
    case 'datetime':
      return String(v).trim() === ''
    case 'daterange':
      return !Array.isArray(v) || v.length !== 2 || !v[0] || !v[1]
    case 'select':
      return v === ''
    case 'multiselect':
    case 'user':
    case 'dept':
    case 'file':
    case 'table':
      return !Array.isArray(v) || v.length === 0
    default:
      return false
  }
}

/** 校验单字段（不含 required，仅规则/类型），返回错误信息或 null。 */
function checkRules(field: FieldDef, v: unknown): string | null {
  const r = field.rules ?? {}
  switch (field.type) {
    case 'number':
    case 'money': {
      const n = Number(v)
      if (Number.isNaN(n)) return `${field.label}必须是数字`
      if (r.min !== undefined && n < r.min)
        return `${field.label}不能小于 ${r.min}`
      if (r.max !== undefined && n > r.max)
        return `${field.label}不能大于 ${r.max}`
      return null
    }
    case 'text':
    case 'textarea': {
      const s = String(v)
      if (r.minLength !== undefined && s.length < r.minLength)
        return `${field.label}至少 ${r.minLength} 个字符`
      if (r.maxLength !== undefined && s.length > r.maxLength)
        return `${field.label}最多 ${r.maxLength} 个字符`
      if (r.pattern) {
        try {
          if (!new RegExp(r.pattern).test(s)) return `${field.label}格式不正确`
        } catch {
          /* 非法正则忽略 */
        }
      }
      return null
    }
    case 'multiselect':
    case 'user':
    case 'dept':
    case 'file': {
      const arr = Array.isArray(v) ? v : []
      if (r.minItems !== undefined && arr.length < r.minItems)
        return `${field.label}至少选择 ${r.minItems} 项`
      if (r.maxItems !== undefined && arr.length > r.maxItems)
        return `${field.label}最多选择 ${r.maxItems} 项`
      return null
    }
    case 'daterange': {
      if (Array.isArray(v) && v.length === 2 && v[0] && v[1]) {
        if (String(v[0]) > String(v[1]))
          return `${field.label}起始日期不能晚于结束日期`
      }
      return null
    }
    default:
      return null
  }
}

/**
 * 校验整张表单。table 子表逐行按 columns 校验，错误 key 形如 `items[0].amount`。
 * desc 字段跳过。未知字段不报错（只校验 schema 内的字段）。
 */
export function validateForm(
  schema: FormSchema,
  data: Record<string, unknown>,
): ValidateResult {
  const errors: FormErrors = {}

  for (const field of schema) {
    if (field.type === 'desc') continue
    const v = data[field.key]

    if (field.required && isEmpty(field.type, v)) {
      errors[field.key] = `请填写${field.label}`
      continue
    }
    if (isEmpty(field.type, v)) continue // 非必填且为空：跳过规则校验

    if (field.type === 'table') {
      const rows = Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []
      const cols = field.columns ?? []
      rows.forEach((row, i) => {
        for (const col of cols) {
          if (col.type === 'desc') continue
          const cv = (row as Record<string, unknown> | null)?.[col.key]
          const ekey = `${field.key}[${i}].${col.key}`
          if (col.required && isEmpty(col.type, cv)) {
            errors[ekey] = `请填写${col.label}`
            continue
          }
          if (isEmpty(col.type, cv)) continue
          const e = checkRules(col, cv)
          if (e) errors[ekey] = e
        }
      })
      continue
    }

    const e = checkRules(field, v)
    if (e) errors[field.key] = e
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

/** 给一张 schema 造一个空白初始值（各字段按类型给默认空值）。 */
export function emptyValue(type: FieldType): unknown {
  switch (type) {
    case 'multiselect':
    case 'user':
    case 'dept':
    case 'file':
    case 'table':
      return []
    case 'daterange':
      return ['', '']
    case 'number':
    case 'money':
      return ''
    default:
      return ''
  }
}

/** 据 schema 生成初始表单值对象（不含 desc）。 */
export function initialFormValue(schema: FormSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of schema) {
    if (f.type === 'desc') continue
    out[f.key] = emptyValue(f.type)
  }
  return out
}

/** 合法字段类型集合（设计器/后端结构校验用）。 */
const FIELD_TYPES = new Set<FieldType>([
  'text',
  'textarea',
  'number',
  'money',
  'date',
  'datetime',
  'daterange',
  'select',
  'multiselect',
  'user',
  'dept',
  'table',
  'file',
  'desc',
])

/** 单字段定义结构校验（不校验值，校验 schema 本身是否合法）。入参为未受信任的 JSON。 */
function checkFieldDef(
  raw: unknown,
  seenKeys: Set<string>,
  inTable: boolean,
): string | null {
  if (!raw || typeof raw !== 'object') return '字段定义无效'
  const f = raw as FieldDef
  if (!f.key || !/^[A-Za-z_][\w]*$/.test(f.key))
    return `字段标识「${f.key || ''}」非法（需字母/下划线开头）`
  if (seenKeys.has(f.key)) return `字段标识「${f.key}」重复`
  seenKeys.add(f.key)
  if (!FIELD_TYPES.has(f.type)) return `字段「${f.key}」类型非法`
  if (!(typeof f.label === 'string' && f.label.trim()) && f.type !== 'desc')
    return `字段「${f.key}」缺少标签`
  if (f.type === 'select' || f.type === 'multiselect') {
    if (!Array.isArray(f.options) || f.options.length === 0)
      return `字段「${f.label || f.key}」需至少一个选项`
  }
  if (f.type === 'table') {
    if (inTable) return `明细子表不能再嵌套明细子表`
    const cols = f.columns ?? []
    if (cols.length === 0) return `明细子表「${f.label || f.key}」需至少一列`
    const colKeys = new Set<string>()
    for (const c of cols) {
      if (c.type === 'table' || c.type === 'file')
        return `明细子表列不支持 ${c.type} 类型`
      const e = checkFieldDef(c, colKeys, true)
      if (e) return e
    }
  }
  return null
}

/** 校验整张表单 schema 结构（设计器保存前 / 后端入库前）。返回错误信息或 null。 */
export function validateFormSchema(schema: unknown): string | null {
  if (!Array.isArray(schema)) return '表单结构必须是字段数组'
  const keys = new Set<string>()
  for (const f of schema) {
    const e = checkFieldDef(f, keys, false)
    if (e) return e
  }
  return null
}

/** 明细子表：新建一空行（按 columns 默认值）。供渲染器「增行」用，纯函数便于测试。 */
export function emptyTableRow(
  columns: Array<FieldDef>,
): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const c of columns) {
    if (c.type === 'desc') continue
    row[c.key] = emptyValue(c.type)
  }
  return row
}
