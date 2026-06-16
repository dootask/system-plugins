import type { MsgEntry } from '#/lib/i18n/messages/entry'

// 表单：校验错误（{label} 为字段标签）、schema 结构校验、渲染器 UI。
export const form = {
  // —— 值校验 ——
  'form.err.required': { zh: '请填写{label}', en: 'Please fill in {label}' },
  'form.err.number': {
    zh: '{label}必须是数字',
    en: '{label} must be a number',
  },
  'form.err.min': {
    zh: '{label}不能小于 {min}',
    en: '{label} must be at least {min}',
  },
  'form.err.max': {
    zh: '{label}不能大于 {max}',
    en: '{label} must be at most {max}',
  },
  'form.err.minLength': {
    zh: '{label}至少 {n} 个字符',
    en: '{label} must be at least {n} characters',
  },
  'form.err.maxLength': {
    zh: '{label}最多 {n} 个字符',
    en: '{label} must be at most {n} characters',
  },
  'form.err.pattern': {
    zh: '{label}格式不正确',
    en: '{label} has an invalid format',
  },
  'form.err.minItems': {
    zh: '{label}至少选择 {n} 项',
    en: 'Select at least {n} for {label}',
  },
  'form.err.maxItems': {
    zh: '{label}最多选择 {n} 项',
    en: 'Select at most {n} for {label}',
  },
  'form.err.dateRangeOrder': {
    zh: '{label}起始日期不能晚于结束日期',
    en: '{label}: start date cannot be later than end date',
  },

  // —— schema 结构校验 ——
  'form.schema.notArray': {
    zh: '表单结构必须是字段数组',
    en: 'Form schema must be an array of fields',
  },
  'form.schema.invalidField': {
    zh: '字段定义无效',
    en: 'Invalid field definition',
  },
  'form.schema.badKey': {
    zh: '字段标识「{key}」非法（需字母/下划线开头）',
    en: 'Invalid field key "{key}" (must start with a letter or underscore)',
  },
  'form.schema.dupKey': {
    zh: '字段标识「{key}」重复',
    en: 'Duplicate field key "{key}"',
  },
  'form.schema.badType': {
    zh: '字段「{key}」类型非法',
    en: 'Field "{key}" has an invalid type',
  },
  'form.schema.noLabel': {
    zh: '字段「{key}」缺少标签',
    en: 'Field "{key}" is missing a label',
  },
  'form.schema.noOptions': {
    zh: '字段「{label}」需至少一个选项',
    en: 'Field "{label}" needs at least one option',
  },
  'form.schema.nestedTable': {
    zh: '明细子表不能再嵌套明细子表',
    en: 'A sub-table cannot be nested inside another sub-table',
  },
  'form.schema.noColumns': {
    zh: '明细子表「{label}」需至少一列',
    en: 'Sub-table "{label}" needs at least one column',
  },
  'form.schema.badColType': {
    zh: '明细子表列不支持 {type} 类型',
    en: 'Sub-table columns do not support the {type} type',
  },

  // —— 表单渲染器 UI ——
  'form.select.placeholder': { zh: '请选择', en: 'Please select' },
  'form.user.pick': { zh: '选择', en: 'Select' },
  'form.upload.failed': {
    zh: '「{name}」上传失败',
    en: 'Failed to upload "{name}"',
  },
  'form.remove': { zh: '移除', en: 'Remove' },
  'form.addFile': { zh: '添加附件', en: 'Add attachment' },
  'form.uploading': { zh: '上传中…（{n}）', en: 'Uploading… ({n})' },
  'form.noFile': { zh: '无附件', en: 'No attachments' },
  'form.addRow': { zh: '增加一行', en: 'Add Row' },
} satisfies Record<string, MsgEntry>
