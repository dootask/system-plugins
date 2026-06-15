/**
 * 内置模板集成测试：
 *  1. 幂等播种（ensureBuiltinSeeded）注入 5 个模板，重复调用不重复造数据。
 *  2. 每个模板的 form_schema 经 validateFormSchema 通过、flow_nodes 经 validateFlowTree 通过。
 *  3. 每个模板的 flow 能被 expandFlow 展开（提供 resolveLeader），且对各自合法 form_data
 *     validateForm 通过。
 *  4. 报销模板金额条件分流正确：>阈值 走两级主管、<=阈值 走一级主管。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { closeDb, getDb, setDbForTesting } from '#/lib/db'
import { listDefs } from '#/lib/repo/defs'
import { getSetting, SETTING_KEYS } from '#/lib/repo/settings'
import {
  validateFormSchema,
  validateForm,
  initialFormValue,
} from '#/lib/form/validate'
import { validateFlowTree, expandFlow } from '#/lib/engine'
import type { FlowNode } from '#/lib/engine'
import type { FormSchema } from '#/lib/form/types'
import {
  BUILTIN_TEMPLATES,
  ensureBuiltinSeeded,
  seedBuiltinTemplates,
} from './builtin'

beforeEach(() => setDbForTesting(new Database(':memory:')))
afterEach(() => closeDb())

// 直属/上级主管解析器（test stub）：level 1 → 100，level 2 → 200。
const resolveLeader = (_dept: number | null | undefined, level: number) =>
  level === 1 ? 100 : level === 2 ? 200 : undefined

function flowOf(name: string): FlowNode {
  const d = listDefs().find((x) => x.name === name)!
  return JSON.parse(d.flow_nodes) as FlowNode
}
function schemaOf(name: string): FormSchema {
  const d = listDefs().find((x) => x.name === name)!
  return JSON.parse(d.form_schema) as FormSchema
}

describe('内置模板：幂等播种', () => {
  it('全新库注入 5 个模板，重复调用跳过', () => {
    const r1 = ensureBuiltinSeeded()
    expect(r1.created.length).toBe(BUILTIN_TEMPLATES.length)
    expect(listDefs().length).toBe(BUILTIN_TEMPLATES.length)
    expect(getSetting(SETTING_KEYS.builtinSeeded)).toBeTruthy()

    const r2 = ensureBuiltinSeeded()
    expect(r2.skipped).toBe(true)
    expect(r2.created.length).toBe(0)
    expect(listDefs().length).toBe(BUILTIN_TEMPLATES.length)
  })

  it('库内已有同名模板（迁移带入）时按名跳过、其余内置补齐', () => {
    // 模拟迁移带入旧「请假」「加班」：内置应跳过这两个、补齐其余（报销/差旅申请/评审）。
    getDb()
      .prepare(
        `INSERT INTO proc_def (name, category, created_by) VALUES ('请假', 'vacate', 1), ('加班', 'overtime', 1)`,
      )
      .run()
    const r = ensureBuiltinSeeded()
    expect(r.skipped).toBe(false)
    expect(r.created.length).toBe(BUILTIN_TEMPLATES.length - 2)
    // 同名不重复：请假/加班仍各 1 条。
    expect(listDefs().filter((d) => d.name === '请假').length).toBe(1)
    expect(listDefs().filter((d) => d.name === '加班').length).toBe(1)
    expect(listDefs().length).toBe(BUILTIN_TEMPLATES.length)
  })

  it('seedBuiltinTemplates 按名补齐缺失（不重复）', () => {
    seedBuiltinTemplates()
    const n = listDefs().length
    seedBuiltinTemplates()
    expect(listDefs().length).toBe(n)
  })
})

describe('内置模板：schema + flow 合法性', () => {
  beforeEach(() => ensureBuiltinSeeded())

  for (const t of BUILTIN_TEMPLATES) {
    it(`「${t.name}」schema/flow 校验通过且可展开`, () => {
      const schema = schemaOf(t.name)
      const flow = flowOf(t.name)
      expect(validateFormSchema(schema)).toBeNull()
      expect(validateFlowTree(flow)).toBeNull()

      // 展开（提供主管解析器 + 空 form_data）：非报销模板不依赖 form_data。
      // 报销含 route，需 form_data 命中分支，单独在下一个 describe 验证；这里给个高额值兜底。
      const seq = expandFlow(flow, {
        starterId: 10,
        deptId: 1,
        formData: { amount: 9999 },
        resolveLeader,
      })
      const approvers = seq.filter((n) => n.type === 'approver')
      expect(approvers.length).toBeGreaterThan(0)
      // 主管节点都解析出了审批人（100/200）。
      for (const a of approvers) expect(a.approverIds.length).toBeGreaterThan(0)
    })
  }

  it('各模板对一份合法 form_data 通过 validateForm', () => {
    const samples: Record<string, Record<string, unknown>> = {
      请假: {
        leaveType: '年假',
        startTime: '2026-07-01',
        endTime: '2026-07-03',
        days: 3,
        reason: 'x',
      },
      加班: {
        startTime: '2026-07-01',
        endTime: '2026-07-01',
        hours: 4,
        reason: 'x',
      },
      报销: {
        amount: 1200,
        items: [{ category: '差旅', amount: 1200, note: '' }],
        invoices: [],
        reason: 'x',
      },
      差旅申请: {
        trips: [
          {
            from: '北京',
            to: '上海',
            departDate: '2026-07-01',
            returnDate: '',
            transport: '高铁',
          },
        ],
        companions: [],
        attachments: [],
        reason: 'x',
      },
      评审: {
        reviewType: 'design',
        materials: [{ name: 'a.pdf' }],
        reviewers: [42],
        reason: 'x',
      },
    }
    for (const t of BUILTIN_TEMPLATES) {
      const schema = schemaOf(t.name)
      const data = { ...initialFormValue(schema), ...samples[t.name] }
      const r = validateForm(schema, data)
      expect(r.valid, `${t.name}: ${JSON.stringify(r.errors)}`).toBe(true)
    }
  })
})

describe('内置模板：报销金额条件分流', () => {
  beforeEach(() => ensureBuiltinSeeded())

  it('金额 > 阈值 → 两级主管（直属+上级）', () => {
    const flow = flowOf('报销')
    const seq = expandFlow(flow, {
      starterId: 10,
      deptId: 1,
      formData: { amount: 8000 },
      resolveLeader,
    })
    const approverNodes = seq.filter((n) => n.type === 'approver')
    // directorLevel=2 的 leader 节点展开为「直属(level1)+上级(level2)」两个审批节点。
    expect(approverNodes.map((n) => n.nodeId)).toEqual([
      'approver-high-1',
      'approver-high-2',
    ])
    expect(approverNodes[0].approverIds).toEqual([100])
    expect(approverNodes[1].approverIds).toEqual([200])
  })

  it('金额 <= 阈值 → 仅一级主管（兜底分支）', () => {
    const flow = flowOf('报销')
    const seq = expandFlow(flow, {
      starterId: 10,
      deptId: 1,
      formData: { amount: 1000 },
      resolveLeader,
    })
    const approverNodes = seq.filter((n) => n.type === 'approver')
    expect(approverNodes.map((n) => n.nodeId)).toEqual(['approver-low-1'])
    expect(approverNodes[0].approverIds).toEqual([100])
  })
})
