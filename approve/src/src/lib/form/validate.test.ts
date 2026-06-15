import { describe, expect, it } from 'vitest'
import {
  emptyTableRow,
  emptyValue,
  initialFormValue,
  isEmpty,
  validateForm,
} from './validate'
import type { FormSchema } from './types'

describe('isEmpty', () => {
  it('文本/数字/数组/日期范围按类型判空', () => {
    expect(isEmpty('text', '')).toBe(true)
    expect(isEmpty('text', '  ')).toBe(true)
    expect(isEmpty('text', 'x')).toBe(false)
    expect(isEmpty('number', '')).toBe(true)
    expect(isEmpty('number', 0)).toBe(false)
    expect(isEmpty('multiselect', [])).toBe(true)
    expect(isEmpty('user', [1])).toBe(false)
    expect(isEmpty('daterange', ['2024-01-01', ''])).toBe(true)
    expect(isEmpty('daterange', ['2024-01-01', '2024-01-02'])).toBe(false)
  })
})

describe('validateForm', () => {
  const schema: FormSchema = [
    { key: 'title', type: 'text', label: '标题', required: true },
    {
      key: 'amount',
      type: 'money',
      label: '金额',
      required: true,
      rules: { min: 0, max: 100 },
    },
    { key: 'note', type: 'textarea', label: '备注', rules: { maxLength: 5 } },
    {
      key: 'level',
      type: 'select',
      label: '级别',
      options: [{ label: 'A', value: 'a' }],
    },
    {
      key: 'items',
      type: 'table',
      label: '明细',
      columns: [
        { key: 'name', type: 'text', label: '项目', required: true },
        { key: 'cost', type: 'number', label: '费用', rules: { min: 1 } },
      ],
    },
    { key: 'tip', type: 'desc', label: '说明' },
  ]

  it('必填缺失报错', () => {
    const { valid, errors } = validateForm(schema, {})
    expect(valid).toBe(false)
    expect(errors.title).toBeTruthy()
    expect(errors.amount).toBeTruthy()
  })

  it('数字范围与文本长度规则生效', () => {
    const { errors } = validateForm(schema, {
      title: 't',
      amount: 200,
      note: 'toolong',
    })
    expect(errors.amount).toContain('不能大于')
    expect(errors.note).toContain('最多')
  })

  it('明细子表逐行校验，错误 key 带行号', () => {
    const { valid, errors } = validateForm(schema, {
      title: 't',
      amount: 10,
      items: [
        { name: '', cost: 0 },
        { name: 'ok', cost: 5 },
      ],
    })
    expect(valid).toBe(false)
    expect(errors['items[0].name']).toBeTruthy()
    expect(errors['items[0].cost']).toContain('不能小于')
    expect(errors['items[1].name']).toBeUndefined()
  })

  it('全部合法时通过', () => {
    const { valid } = validateForm(schema, {
      title: 't',
      amount: 50,
      note: 'ok',
      items: [{ name: 'a', cost: 2 }],
    })
    expect(valid).toBe(true)
  })

  it('desc 字段不参与校验', () => {
    const { errors } = validateForm(
      [{ key: 'd', type: 'desc', label: '说明' }],
      {},
    )
    expect(Object.keys(errors)).toHaveLength(0)
  })
})

describe('表单值工具', () => {
  it('emptyValue 按类型给默认', () => {
    expect(emptyValue('user')).toEqual([])
    expect(emptyValue('daterange')).toEqual(['', ''])
    expect(emptyValue('text')).toBe('')
  })

  it('initialFormValue 跳过 desc', () => {
    const v = initialFormValue([
      { key: 'a', type: 'text', label: 'A' },
      { key: 'd', type: 'desc', label: 'D' },
    ])
    expect(v).toEqual({ a: '' })
  })

  it('emptyTableRow 按列默认值建行并跳过 desc', () => {
    const row = emptyTableRow([
      { key: 'n', type: 'text', label: 'N' },
      { key: 'u', type: 'user', label: 'U' },
      { key: 'd', type: 'desc', label: 'D' },
    ])
    expect(row).toEqual({ n: '', u: [] })
  })
})
