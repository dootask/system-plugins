import { describe, expect, it } from 'vitest'
import {
  addBranch,
  collectFieldKeys,
  conditionFields,
  insertAfter,
  insertInBranch,
  makeApprover,
  makeCondition,
  makeField,
  makeRoute,
  makeStart,
  removeBranch,
  removeNode,
  updateBranch,
  updateNode,
} from './utils'
import { expandFlow, validateFlowTree } from '#/lib/engine/flow'
import {
  initialFormValue,
  validateForm,
  validateFormSchema,
} from '#/lib/form/validate'
import type { FormSchema } from '#/lib/form/types'
import { makeT } from '#/lib/i18n/translate'

// ────────────────────────────────────────────────────────────────────────
// 集成测试：设计器纯逻辑产出的 form_schema / flow_nodes 能被引擎正确使用。
// ────────────────────────────────────────────────────────────────────────

const _tZh = makeT('zh')
const vFlow = (f: unknown) => validateFlowTree(f, _tZh)
const vSchema = (s: unknown) => validateFormSchema(s, _tZh)

describe('表单设计器产出 → validateForm', () => {
  it('增字段后产出合法 schema，可被 validateForm 校验', () => {
    let schema: FormSchema = []
    schema = [...schema, makeField('text', collectFieldKeys(schema))]
    schema = [...schema, makeField('money', collectFieldKeys(schema))]
    schema = [...schema, makeField('select', collectFieldKeys(schema))]
    // 设了必填
    schema = schema.map((f) => ({ ...f, required: true }))

    expect(vSchema(schema)).toBeNull()

    // 空值 → required 报错
    const empty = initialFormValue(schema)
    const r1 = validateForm(schema, empty, _tZh)
    expect(r1.valid).toBe(false)
    expect(Object.keys(r1.errors).length).toBe(3)

    // 填好 → 通过
    const filled: Record<string, unknown> = {}
    for (const f of schema) {
      filled[f.key] =
        f.type === 'money'
          ? 100
          : f.type === 'select'
            ? f.options![0].value
            : 'x'
    }
    expect(validateForm(schema, filled, _tZh).valid).toBe(true)
  })

  it('明细子表 schema 合法且校验生效', () => {
    const schema: FormSchema = [makeField('table', new Set())]
    schema[0].columns = [
      { key: 'name', type: 'text', label: '名称', required: true },
      { key: 'amount', type: 'number', label: '金额' },
    ]
    expect(vSchema(schema)).toBeNull()
    const r = validateForm(schema, {
      [schema[0].key]: [{ name: '', amount: 5 }],
    }, _tZh)
    expect(r.valid).toBe(false)
    expect(r.errors[`${schema[0].key}[0].name`]).toContain('名称')
  })

  it('非法 schema 被拒：重复 key / select 无选项', () => {
    expect(
      vSchema([
        { key: 'a', type: 'text', label: 'A' },
        { key: 'a', type: 'text', label: 'A2' },
      ]),
    ).toContain('重复')
    expect(
      vSchema([
        { key: 's', type: 'select', label: 'S', options: [] },
      ]),
    ).toContain('选项')
  })
})

describe('流程设计器产出 → validateFlowTree + expandFlow', () => {
  it('start → approver(指定人) 可展开', () => {
    let flow = makeStart()
    const ap = makeApprover()
    ap.userIds = [20]
    flow = insertAfter(flow, 'start', ap)

    expect(vFlow(flow)).toBeNull()
    const seq = expandFlow(flow, { starterId: 10, formData: {} })
    expect(seq.map((n) => n.type)).toEqual(['start', 'approver'])
    expect(seq[1].approverIds).toEqual([20])
  })

  it('连续多级主管展开为多个节点', () => {
    let flow = makeStart()
    const ap = makeApprover()
    ap.settype = 'leader'
    ap.directorLevel = 3
    flow = insertAfter(flow, 'start', ap)

    expect(vFlow(flow)).toBeNull()
    const seq = expandFlow(flow, {
      starterId: 10,
      formData: {},
      resolveLeader: (level) => [100 + level],
    })
    // start + 3 级主管
    expect(
      seq.filter((n) => n.type === 'approver').map((n) => n.approverIds[0]),
    ).toEqual([101, 102, 103])
  })

  it('条件分支按 form_schema 数值字段分流（金额>5000 升级）', () => {
    const schema: FormSchema = [
      { key: 'amount', type: 'money', label: '金额' },
      { key: 'note', type: 'text', label: '备注' },
    ]
    // 条件来源应识别出 money 字段
    const cf = conditionFields(schema)
    expect(cf.map((f) => f.field)).toContain('amount')
    expect(cf.find((f) => f.field === 'amount')?.numeric).toBe(true)

    let flow = makeStart()
    const route = makeRoute()
    flow = insertAfter(flow, 'start', route)
    const [hiBranch, defBranch] = route.conditionNodes!
    // 高额分支：amount > 5000
    flow = updateBranch(flow, hiBranch.nodeId, {
      conditions: [{ field: 'amount', op: 'gt', value: 5000 }],
    })
    // 高额分支接总监审批
    const boss = makeApprover()
    boss.userIds = [99]
    flow = insertInBranch(flow, hiBranch.nodeId, boss)
    // 默认分支接主管审批
    const mgr = makeApprover()
    mgr.userIds = [50]
    flow = insertInBranch(flow, defBranch.nodeId, mgr)

    expect(vFlow(flow)).toBeNull()

    const hi = expandFlow(flow, { starterId: 1, formData: { amount: 8000 } })
    expect(
      hi.filter((n) => n.type === 'approver').map((n) => n.approverIds[0]),
    ).toEqual([99])

    const lo = expandFlow(flow, { starterId: 1, formData: { amount: 100 } })
    expect(
      lo.filter((n) => n.type === 'approver').map((n) => n.approverIds[0]),
    ).toEqual([50])
  })

  it('校验拦截：无审批节点 / 分支缺兜底', () => {
    const onlyStart = makeStart()
    expect(vFlow(onlyStart)).toContain('审批节点')

    // 给条件分支都加条件（无兜底）
    let flow = makeStart()
    const route = makeRoute()
    flow = insertAfter(flow, 'start', route)
    for (const b of route.conditionNodes!) {
      flow = updateBranch(flow, b.nodeId, {
        conditions: [makeCondition('x')],
      })
      const ap = makeApprover()
      ap.userIds = [1]
      flow = insertInBranch(flow, b.nodeId, ap)
    }
    expect(vFlow(flow)).toContain('兜底')
  })

  it('树操作：增删节点/分支保持结构正确', () => {
    let flow = makeStart()
    const ap1 = makeApprover()
    ap1.userIds = [1]
    const ap2 = makeApprover()
    ap2.userIds = [2]
    flow = insertAfter(flow, 'start', ap1)
    flow = insertAfter(flow, ap1.nodeId, ap2)
    expect(flow.childNode?.nodeId).toBe(ap1.nodeId)
    expect(flow.childNode?.childNode?.nodeId).toBe(ap2.nodeId)

    // 删 ap1，ap2 顶上
    flow = removeNode(flow, ap1.nodeId)
    expect(flow.childNode?.nodeId).toBe(ap2.nodeId)

    // route 加分支再删到只剩一个 → route 解散
    const route = makeRoute()
    flow = insertAfter(flow, ap2.nodeId, route)
    flow = addBranch(flow, route.nodeId)
    let cur = flow.childNode
    while (cur && cur.type !== 'route') cur = cur.childNode
    expect(cur?.conditionNodes?.length).toBe(3)
    // 删两个分支 → route 整体移除
    const bs = cur!.conditionNodes!
    flow = removeBranch(flow, route.nodeId, bs[0].nodeId)
    flow = removeBranch(flow, route.nodeId, bs[1].nodeId)
    // route 应已解散
    expect(vFlow(updateNode(flow, ap2.nodeId, {}))).toBeNull()
  })
})
