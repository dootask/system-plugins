import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FormRenderer } from './FormRenderer'
import type { FormSchema } from '#/lib/form/types'

// 渲染器逻辑/渲染冒烟测试：用 react-dom/server 静态渲染（无需 DOM 环境），
// 验证各字段类型都能渲染、只读态不出现编辑控件按钮、错误信息透传。

const SCHEMA: FormSchema = [
  { key: 'name', type: 'text', label: '姓名', required: true },
  { key: 'memo', type: 'textarea', label: '备注' },
  { key: 'amount', type: 'money', label: '金额' },
  { key: 'when', type: 'date', label: '日期' },
  { key: 'range', type: 'daterange', label: '区间' },
  {
    key: 'lvl',
    type: 'select',
    label: '级别',
    options: [{ label: 'A', value: 'a' }],
  },
  {
    key: 'tags',
    type: 'multiselect',
    label: '标签',
    options: [{ label: 'X', value: 'x' }],
  },
  { key: 'who', type: 'user', label: '审批人' },
  {
    key: 'items',
    type: 'table',
    label: '明细',
    columns: [{ key: 'n', type: 'text', label: '项' }],
  },
  { key: 'files', type: 'file', label: '附件' },
  { key: 'tip', type: 'desc', label: '提示', props: { text: '说明文字' } },
]

const VALUE = {
  name: '张三',
  amount: 12,
  range: ['2024-01-01', '2024-01-02'],
  lvl: 'a',
  tags: ['x'],
  who: [20],
  items: [{ n: 'a' }],
  files: [{ name: 'f.pdf' }],
}

describe('FormRenderer 渲染', () => {
  it('可编辑态：含必填星号、表单控件、增行/选择按钮', () => {
    const html = renderToStaticMarkup(
      <FormRenderer schema={SCHEMA} value={VALUE} onChange={() => {}} />,
    )
    expect(html).toContain('姓名')
    expect(html).toContain('*') // required 星号
    // 无 LocaleProvider 时 useT 回退默认语言（en），故 UI 文案断言英文。
    expect(html).toContain('Add Row')
    expect(html).toContain('Select') // 人员选择按钮
    expect(html).toContain('说明文字') // desc 文案（数据，不翻译）
    expect(html).toContain('张三') // 文本值
  })

  it('只读态：无增行/选择/添加附件按钮', () => {
    const html = renderToStaticMarkup(
      <FormRenderer schema={SCHEMA} value={VALUE} readOnly />,
    )
    expect(html).not.toContain('Add Row')
    expect(html).not.toContain('Add attachment')
    // 只读仍展示值
    expect(html).toContain('张三')
    expect(html).toContain('f.pdf')
  })

  it('错误信息透传（含 table 子字段 key）', () => {
    const html = renderToStaticMarkup(
      <FormRenderer
        schema={SCHEMA}
        value={{ ...VALUE, items: [{ n: '' }] }}
        onChange={() => {}}
        errors={{ name: '请填写姓名', 'items[0].n': '请填写项' }}
      />,
    )
    expect(html).toContain('请填写姓名')
    expect(html).toContain('请填写项')
  })
})
