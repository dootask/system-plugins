/**
 * 自定义表单引擎类型（前后端共用）。对应 REWRITE_PLAN §6 的 form_schema 结构，
 * 存于 proc_def.form_schema（JSON 字段定义数组）。
 *
 * 设计要点：
 * - 字段值的存储形态见各 FieldType 注释；validateForm / FormRenderer 共享这套类型。
 * - 表单值整体是 `Record<string, unknown>`（= proc_inst.form_data 解析后的对象），
 *   key 为 FieldDef.key。
 */

/** 支持的字段类型。 */
export type FieldType =
  | 'text' // 单行文本 → string
  | 'textarea' // 多行文本 → string
  | 'number' // 数字 → number
  | 'money' // 金额（数字，按货币展示）→ number
  | 'date' // 日期 → string(YYYY-MM-DD)
  | 'datetime' // 日期时间 → string(YYYY-MM-DD HH:mm)
  | 'daterange' // 日期范围 → [string, string]
  | 'select' // 单选下拉 → string | number
  | 'multiselect' // 多选 → Array<string | number>
  | 'user' // 人员（调主程序选人）→ Array<number>(userid)
  | 'dept' // 部门 → Array<number>(deptId)
  | 'table' // 明细子表 → Array<Record<string, unknown>>
  | 'file' // 附件 → Array<FileValue>
  | 'desc' // 说明文字（无值，仅展示）

/** 下拉/多选选项。 */
export interface FieldOption {
  label: string
  value: string | number
}

/** 字段级校验规则（与 required 叠加）。 */
export interface FieldRules {
  /** 数字/金额：最小值。 */
  min?: number
  /** 数字/金额：最大值。 */
  max?: number
  /** 文本：最小长度。 */
  minLength?: number
  /** 文本：最大长度。 */
  maxLength?: number
  /** 文本：正则（字符串形式，校验时 new RegExp）。 */
  pattern?: string
  /** 人员/多选/附件：最少选/传数量。 */
  minItems?: number
  /** 人员/多选/附件：最多选/传数量。 */
  maxItems?: number
}

/** 字段展示/行为附加属性（按类型取用）。 */
export interface FieldProps {
  /** 占位符。 */
  placeholder?: string
  /** number/money：步进。 */
  step?: number
  /** money：货币符号（默认 ¥）。 */
  currency?: string
  /** user/multiselect/file：是否允许多个（默认按类型语义）。 */
  multiple?: boolean
  /** desc：说明文字内容。 */
  text?: string
  /** textarea：行数。 */
  rows?: number
}

/** 附件值（M3a 仅占位，真正上传在 M4 接主程序）。 */
export interface FileValue {
  /** 主程序 File id（M4 上传后回填）。 */
  fileId?: number
  /** 文件名。 */
  name: string
  /** 字节数。 */
  size?: number
  /** 扩展名。 */
  ext?: string
}

/** 单个字段定义。 */
export interface FieldDef {
  /** 字段键（form_data 的 key，需在表单内唯一）。 */
  key: string
  /** 字段类型。 */
  type: FieldType
  /** 标签。 */
  label: string
  /** 是否必填（desc 类型忽略）。 */
  required?: boolean
  /** select/multiselect 的可选项。 */
  options?: Array<FieldOption>
  /** 明细子表（type=table）的列定义（不允许再嵌套 table/file）。 */
  columns?: Array<FieldDef>
  /** 校验规则。 */
  rules?: FieldRules
  /** 展示/行为附加属性。 */
  props?: FieldProps
  /** 帮助说明（字段下方灰字）。 */
  hint?: string
}

/** 表单 schema = 字段定义数组（proc_def.form_schema 解析后）。 */
export type FormSchema = Array<FieldDef>

/** 校验错误：字段 key → 错误信息。table 子字段用 `key[rowIndex].subKey` 形式。 */
export type FormErrors = Record<string, string>

/** 校验结果。 */
export interface ValidateResult {
  valid: boolean
  errors: FormErrors
}
