/**
 * 端到端集成测试：经 API handler 驱动跑通
 *   发起 → 审批人通过 → 完成
 * 全链路（单审批人 + 双级依次审批两条路径），并覆盖退回→重新提交、评论、撤回。
 *
 * 这里用测试夹具模板（指定审批人 settype=specific，不依赖主程序部门主管解析），
 * 正式内置模板（leader 主管来源）的校验/展开见 builtin.test.ts。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { closeDb, setDbForTesting } from '#/lib/db'
import { createDef } from '#/lib/repo/defs'
import { InstState } from '#/lib/engine'
import type { FlowNode } from '#/lib/engine'
import type { FormSchema } from '#/lib/form/types'

import {
  commentInstHandler,
  createInstHandler,
  getInstDetail,
  listInstsHandler,
} from './insts'
import { actTaskHandler, resubmitHandler } from './tasks'

// requireUser → verifyUserToken：token 形如 'u:<id>' 解出用户 id。
vi.mock('#/lib/dootask-server', () => ({
  verifyUserToken: async (token: string | null) => {
    if (!token) return null
    const m = /^u:(\d+)$/.exec(token)
    const userid = m ? Number(m[1]) : 10
    return { userid, nickname: `用户${userid}`, email: undefined }
  },
  getUserPrimaryDept: async () => null,
  makeClient: async () => null,
  resolveUsers: async (ids: Array<number>) =>
    Object.fromEntries(ids.map((id) => [id, { userid: id, nickname: `用户#${id}` }])),
  resolveRoleMembers: async () => [],
  uploadFile: async () => ({ id: 1, name: 'f' }),
  getFileOne: async () => null,
  sendApprovalCard: async () => null,
  buildDetailCard: () => '> card',
}))

beforeEach(() => setDbForTesting(new Database(':memory:')))
afterEach(() => {
  closeDb()
  vi.clearAllMocks()
})

const BASE = 'http://x/apps/approve/api'

function req(
  path: string,
  opts: { method?: string; user?: number; json?: unknown } = {},
): Request {
  const headers: Record<string, string> = {}
  if (opts.user !== undefined) headers['x-user-token'] = `u:${opts.user}`
  let body: string | undefined
  if (opts.json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(opts.json)
  }
  return new Request(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body,
  })
}

async function json(res: Response) {
  return res.json()
}

// 用户约定：10=发起人，20=一级审批人，30=二级审批人。
const INITIATOR = 10
const APPROVER = 20
const APPROVER2 = 30

const LEAVE_FORM = {
  title: '我要请假',
  leaveType: 'annual',
  range: ['2026-07-01', '2026-07-03'],
  days: 3,
  reason: '回家探亲',
}

const FIXTURE_SCHEMA: FormSchema = [
  { key: 'title', type: 'text', label: '标题', required: true },
  {
    key: 'leaveType',
    type: 'select',
    label: '请假类型',
    required: true,
    options: [{ label: '年假', value: 'annual' }],
  },
  { key: 'range', type: 'daterange', label: '请假时间', required: true },
  {
    key: 'days',
    type: 'number',
    label: '请假天数',
    required: true,
    rules: { min: 0.5 },
  },
  { key: 'reason', type: 'textarea', label: '请假事由' },
]

function singleApproverFlow(approverId: number): FlowNode {
  return {
    nodeId: 'start',
    type: 'start',
    childNode: {
      nodeId: 'approver-1',
      type: 'approver',
      name: '直属审批',
      settype: 'specific',
      approveMode: 'or',
      userIds: [approverId],
    },
  }
}

function twoLevelFlow(level1: number, level2: number): FlowNode {
  return {
    nodeId: 'start',
    type: 'start',
    childNode: {
      nodeId: 'approver-1',
      type: 'approver',
      name: '一级审批',
      settype: 'specific',
      approveMode: 'or',
      userIds: [level1],
      childNode: {
        nodeId: 'approver-2',
        type: 'approver',
        name: '二级审批',
        settype: 'specific',
        approveMode: 'or',
        userIds: [level2],
      },
    },
  }
}

/** 测试夹具：建一个指定审批人的请假模板，返回 def id。 */
function seedSingle(approverId: number): number {
  const d = createDef(
    {
      name: '请假(夹具单级)',
      category: 'vacate',
      form_schema: JSON.stringify(FIXTURE_SCHEMA),
      flow_nodes: JSON.stringify(singleApproverFlow(approverId)),
    },
    INITIATOR,
  )
  return d.id
}

/** 测试夹具：建一个双级依次审批的请假模板，返回 def id。 */
function seedTwoLevel(level1: number, level2: number): number {
  const d = createDef(
    {
      name: '请假(夹具双级)',
      category: 'vacate',
      form_schema: JSON.stringify(FIXTURE_SCHEMA),
      flow_nodes: JSON.stringify(twoLevelFlow(level1, level2)),
    },
    INITIATOR,
  )
  return d.id
}

/** 取当前未完成任务 id（经详情接口拿 active_task）。 */
async function activeTaskId(instId: number, user: number): Promise<number> {
  const d = await json(await getInstDetail(req(`/insts/${instId}`, { user })))
  return d.data.active_task.id as number
}

describe('端到端：单审批人请假', () => {
  it('发起 → 待办 → 审批人通过 → 完成', async () => {
    const defId = seedSingle(APPROVER)

    // 1) 发起
    const create = await json(
      await createInstHandler(
        req('/insts', {
          method: 'POST',
          user: INITIATOR,
          json: { defId, formData: LEAVE_FORM },
        }),
      ),
    )
    const instId = create.data.id as number
    expect(instId).toBeGreaterThan(0)

    // 2) 发起人「我发起」可见；审批人「待我审批」可见
    const mine = await json(
      await listInstsHandler(req('/insts?box=mine', { user: INITIATOR })),
    )
    expect(mine.data.items.map((r: { id: number }) => r.id)).toContain(instId)
    const todo = await json(
      await listInstsHandler(req('/insts?box=todo', { user: APPROVER })),
    )
    expect(todo.data.items.map((r: { id: number }) => r.id)).toContain(instId)

    // 3) 审批人详情 can_act=true，表单数据可读
    const detail = await json(
      await getInstDetail(req(`/insts/${instId}`, { user: APPROVER })),
    )
    expect(detail.data.can_act).toBe(true)
    expect(detail.data.form_data.title).toBe('我要请假')

    // 4) 审批人通过 → 完成
    const taskId = detail.data.active_task.id
    const act = await actTaskHandler(
      req(`/tasks/${taskId}/act`, {
        method: 'POST',
        user: APPROVER,
        json: { action: 'approve', comment: '准了' },
      }),
    )
    expect(act.status).toBe(200)

    const after = await json(
      await getInstDetail(req(`/insts/${instId}`, { user: INITIATOR })),
    )
    expect(after.data.inst.state).toBe(InstState.approved)
    expect(after.data.inst.status).toBe('approved')
    // 时间线含 submit + approve
    const actions = after.data.events.map((e: { action: string }) => e.action)
    expect(actions).toContain('submit')
    expect(actions).toContain('approve')
  })
})

describe('端到端：双级依次审批', () => {
  it('一级通过后转二级，二级通过后完成', async () => {
    const defId = seedTwoLevel(APPROVER, APPROVER2)
    const create = await json(
      await createInstHandler(
        req('/insts', {
          method: 'POST',
          user: INITIATOR,
          json: { defId, formData: LEAVE_FORM },
        }),
      ),
    )
    const instId = create.data.id as number

    // 一级审批人通过
    let taskId = await activeTaskId(instId, APPROVER)
    await actTaskHandler(
      req(`/tasks/${taskId}/act`, {
        method: 'POST',
        user: APPROVER,
        json: { action: 'approve' },
      }),
    )
    // 仍在审批中（进入二级），二级审批人 can_act
    const mid = await json(
      await getInstDetail(req(`/insts/${instId}`, { user: APPROVER2 })),
    )
    expect(mid.data.inst.state).toBe(InstState.running)
    expect(mid.data.can_act).toBe(true)

    // 二级审批人通过 → 完成
    taskId = mid.data.active_task.id
    await actTaskHandler(
      req(`/tasks/${taskId}/act`, {
        method: 'POST',
        user: APPROVER2,
        json: { action: 'approve' },
      }),
    )
    const done = await json(
      await getInstDetail(req(`/insts/${instId}`, { user: INITIATOR })),
    )
    expect(done.data.inst.state).toBe(InstState.approved)
  })
})

describe('端到端：退回 → 重新提交 → 完成', () => {
  it('审批人退回，发起人改表单重新提交后续审通过', async () => {
    const defId = seedSingle(APPROVER)
    const create = await json(
      await createInstHandler(
        req('/insts', {
          method: 'POST',
          user: INITIATOR,
          json: { defId, formData: LEAVE_FORM },
        }),
      ),
    )
    const instId = create.data.id as number

    // 审批人退回（returnTo=initiator）
    let taskId = await activeTaskId(instId, APPROVER)
    const back = await actTaskHandler(
      req(`/tasks/${taskId}/act`, {
        method: 'POST',
        user: APPROVER,
        json: { action: 'return', returnTo: 'initiator', comment: '天数太多' },
      }),
    )
    expect(back.status).toBe(200)

    // 退回后：state=0（待发起人修改），发起人 can_act=false
    const returned = await json(
      await getInstDetail(req(`/insts/${instId}`, { user: INITIATOR })),
    )
    expect(returned.data.inst.state).toBe(InstState.pending)
    expect(returned.data.is_initiator).toBe(true)

    // 发起人改表单重新提交
    const rs = await resubmitHandler(
      req(`/insts/${instId}/resubmit`, {
        method: 'POST',
        user: INITIATOR,
        json: { formData: { ...LEAVE_FORM, days: 1 } },
      }),
      instId,
    )
    expect(rs.status).toBe(200)

    // 重新进入审批中，审批人再次通过 → 完成
    taskId = await activeTaskId(instId, APPROVER)
    await actTaskHandler(
      req(`/tasks/${taskId}/act`, {
        method: 'POST',
        user: APPROVER,
        json: { action: 'approve' },
      }),
    )
    const done = await json(
      await getInstDetail(req(`/insts/${instId}`, { user: INITIATOR })),
    )
    expect(done.data.inst.state).toBe(InstState.approved)
    expect(done.data.form_data.days).toBe(1)
  })
})

describe('端到端：评论与撤回', () => {
  it('参与人可评论；发起人在无人审批前可撤回', async () => {
    const defId = seedSingle(APPROVER)
    const create = await json(
      await createInstHandler(
        req('/insts', {
          method: 'POST',
          user: INITIATOR,
          json: { defId, formData: LEAVE_FORM },
        }),
      ),
    )
    const instId = create.data.id as number

    // 评论（发起人）
    const c = await commentInstHandler(
      req(`/insts/${instId}/comment`, {
        method: 'POST',
        user: INITIATOR,
        json: { comment: '麻烦尽快' },
      }),
      instId,
    )
    expect(c.status).toBe(200)
    // 无关用户 99 评论 → 403
    const c2 = await commentInstHandler(
      req(`/insts/${instId}/comment`, {
        method: 'POST',
        user: 99,
        json: { comment: 'x' },
      }),
      instId,
    )
    expect(c2.status).toBe(403)

    // 撤回（发起人，尚无人审过）
    const taskId = await activeTaskId(instId, INITIATOR)
    const w = await actTaskHandler(
      req(`/tasks/${taskId}/act`, {
        method: 'POST',
        user: INITIATOR,
        json: { action: 'withdraw' },
      }),
    )
    expect(w.status).toBe(200)
    const after = await json(
      await getInstDetail(req(`/insts/${instId}`, { user: INITIATOR })),
    )
    expect(after.data.inst.state).toBe(InstState.withdrawn)
    const actions = after.data.events.map((e: { action: string }) => e.action)
    expect(actions).toContain('comment')
    expect(actions).toContain('withdraw')
  })
})
