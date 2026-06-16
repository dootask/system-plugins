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
import type { TFunc } from '#/lib/i18n/translate'

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
function checkRules(field: FieldDef, v: unknown, t: TFunc): string | null {
  const r = field.rules ?? {}
  const label = field.label
  switch (field.type) {
    case 'number':
    case 'money': {
      const n = Number(v)
      if (Number.isNaN(n)) return t('form.err.number', { label })
      if (r.min !== undefined && n < r.min)
        return t('form.err.min', { label, min: r.min })
      if (r.max !== undefined && n > r.max)
        return t('form.err.max', { label, max: r.max })
      return null
    }
    case 'text':
    case 'textarea': {
      const s = String(v)
      if (r.minLength !== undefined && s.length < r.minLength)
        return t('form.err.minLength', { label, n: r.minLength })
      if (r.maxLength !== undefined && s.length > r.maxLength)
        return t('form.err.maxLength', { label, n: r.maxLength })
      if (r.pattern) {
        try {
          if (!new RegExp(r.pattern).test(s))
            return t('form.err.pattern', { label })
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
        return t('form.err.minItems', { label, n: r.minItems })
      if (r.maxItems !== undefined && arr.length > r.maxItems)
        return t('form.err.maxItems', { label, n: r.maxItems })
      return null
    }
    case 'daterange': {
      if (Array.isArray(v) && v.length === 2 && v[0] && v[1]) {
        if (String(v[0]) > String(v[1]))
          return t('form.err.dateRangeOrder', { label })
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
  t: TFunc,
): ValidateResult {
  const errors: FormErrors = {}

  for (const field of schema) {
    if (field.type === 'desc') continue
    const v = data[field.key]

    if (field.required && isEmpty(field.type, v)) {
      errors[field.key] = t('form.err.required', { label: field.label })
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
            errors[ekey] = t('form.err.required', { label: col.label })
            continue
          }
          if (isEmpty(col.type, cv)) continue
          const e = checkRules(col, cv, t)
          if (e) errors[ekey] = e
        }
      })
      continue
    }

    const e = checkRules(field, v, t)
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
  t: TFunc,
): string | null {
  if (!raw || typeof raw !== 'object') return t('form.schema.invalidField')
  const f = raw as FieldDef
  if (!f.key || !/^[A-Za-z_][\w]*$/.test(f.key))
    return t('form.schema.badKey', { key: f.key || '' })
  if (seenKeys.has(f.key)) return t('form.schema.dupKey', { key: f.key })
  seenKeys.add(f.key)
  if (!FIELD_TYPES.has(f.type)) return t('form.schema.badType', { key: f.key })
  if (!(typeof f.label === 'string' && f.label.trim()) && f.type !== 'desc')
    return t('form.schema.noLabel', { key: f.key })
  if (f.type === 'select' || f.type === 'multiselect') {
    if (!Array.isArray(f.options) || f.options.length === 0)
      return t('form.schema.noOptions', { label: f.label || f.key })
  }
  if (f.type === 'table') {
    if (inTable) return t('form.schema.nestedTable')
    const cols = f.columns ?? []
    if (cols.length === 0)
      return t('form.schema.noColumns', { label: f.label || f.key })
    const colKeys = new Set<string>()
    for (const c of cols) {
      if (c.type === 'table' || c.type === 'file')
        return t('form.schema.badColType', { type: c.type })
      const e = checkFieldDef(c, colKeys, true, t)
      if (e) return e
    }
  }
  return null
}

/** 校验整张表单 schema 结构（设计器保存前 / 后端入库前）。返回错误信息或 null。 */
export function validateFormSchema(schema: unknown, t: TFunc): string | null {
  if (!Array.isArray(schema)) return t('form.schema.notArray')
  const keys = new Set<string>()
  for (const f of schema) {
    const e = checkFieldDef(f, keys, false, t)
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
