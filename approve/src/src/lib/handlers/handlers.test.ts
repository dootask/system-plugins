import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { closeDb, setDbForTesting } from '#/lib/db'
import { createDef } from '#/lib/repo/defs'
import { getInst } from '#/lib/repo/insts'
import { listTasksByInst } from '#/lib/repo/tasks'
import { listPendingByTask } from '#/lib/repo/actors'
import { InstState } from '#/lib/engine'
import type { FlowNode } from '#/lib/engine'
import type { FormSchema } from '#/lib/form/types'

import { getDefDetail } from './defs'
import { createInstHandler, getInstDetail, listInstsHandler } from './insts'
import { actTaskHandler } from './tasks'

// requireUser 走 verifyUserToken → SDK；测试里 mock 成固定用户，token=值即可过鉴权。
vi.mock('#/lib/dootask-server', () => ({
  verifyUserToken: async (token: string | null) => {
    if (!token) return null
    // token 形如 'u:<id>' → 该用户；其余视为用户 10。
    const m = /^u:(\d+)$/.exec(token)
    const userid = m ? Number(m[1]) : 10
    return { userid, nickname: `用户${userid}`, email: undefined }
  },
  // 引擎 deps / 部门解析在测试环境返回空（无 SDK）。
  getUserPrimaryDept: async () => null,
  makeClient: async () => null,
  resolveUsers: async (ids: Array<number>) =>
    Object.fromEntries(ids.map((id) => [id, { userid: id, nickname: `用户#${id}` }])),
  resolveRoleMembers: async () => [],
  // 附件 / 通知在测试环境为 no-op（无 SDK，不发真消息）。
  uploadFile: async () => ({ id: 1, name: 'f' }),
  shareFilesToUsers: async () => undefined,
  getFileOne: async () => null,
  ensureApproveBot: async () => null,
  sendBotDirectMessage: async () => null,
  buildDetailCard: () => '> card',
  sendApproveCard: async () => null,
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

const SCHEMA: FormSchema = [
  { key: 'title', type: 'text', label: '标题', required: true },
  { key: 'amount', type: 'money', label: '金额', required: true },
]

const FLOW: FlowNode = {
  nodeId: 'start',
  type: 'start',
  childNode: {
    nodeId: 'a',
    type: 'approver',
    settype: 'specific',
    approveMode: 'or',
    userIds: [20],
  },
}

function seedDef() {
  return createDef(
    {
      name: '报销',
      form_schema: JSON.stringify(SCHEMA),
      flow_nodes: JSON.stringify(FLOW),
    },
    1,
  ).id
}

describe('鉴权', () => {
  it('无 token → 401', async () => {
    const res = await listInstsHandler(req('/insts'))
    expect(res.status).toBe(401)
  })
})

describe('defs 详情', () => {
  it('返回 form_schema + flow_nodes', async () => {
    const id = seedDef()
    const res = await getDefDetail(req(`/defs/${id}`, { user: 10 }))
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.form_schema).toHaveLength(2)
    expect(data.flow_nodes.nodeId).toBe('start')
  })
})

describe('insts 发起', () => {
  it('表单校验未过 → 400 带 errors', async () => {
    const id = seedDef()
    const res = await createInstHandler(
      req('/insts', {
        method: 'POST',
        user: 10,
        json: { defId: id, formData: {} },
      }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.errors.title).toBeTruthy()
  })

  it('校验通过 → engine.start 落库', async () => {
    const id = seedDef()
    const res = await createInstHandler(
      req('/insts', {
        method: 'POST',
        user: 10,
        json: { defId: id, formData: { title: 't', amount: 100 } },
      }),
    )
    expect(res.status).toBe(201)
    const { data } = await res.json()
    const inst = getInst(data.id)!
    expect(inst.state).toBe(InstState.running)
    expect(inst.initiator_id).toBe(10)
  })
})

describe('insts 列表', () => {
  it('mine / todo / cc 分箱', async () => {
    const defId = seedDef()
    // 用户 10 发起 → mine；审批人 20 → todo。
    await createInstHandler(
      req('/insts', {
        method: 'POST',
        user: 10,
        json: { defId, formData: { title: 't', amount: 1 } },
      }),
    )
    const mine = await (
      await listInstsHandler(req('/insts?box=mine', { user: 10 }))
    ).json()
    expect(mine.data.items).toHaveLength(1)
    expect(mine.data.total).toBe(1)

    const todo = await (
      await listInstsHandler(req('/insts?box=todo', { user: 20 }))
    ).json()
    expect(todo.data.items).toHaveLength(1)

    const cc = await (
      await listInstsHandler(req('/insts?box=cc', { user: 99 }))
    ).json()
    expect(cc.data.items).toHaveLength(0)
  })
})

describe('insts 详情 + tasks act', () => {
  it('发起人可见、审批人 approve 后通过', async () => {
    const defId = seedDef()
    const create = await (
      await createInstHandler(
        req('/insts', {
          method: 'POST',
          user: 10,
          json: { defId, formData: { title: 't', amount: 1 } },
        }),
      )
    ).json()
    const instId = create.data.id

    // 详情：发起人可见，但发起人非 assignee → can_act=false
    const detail = await (
      await getInstDetail(req(`/insts/${instId}`, { user: 10 }))
    ).json()
    expect(detail.data.is_initiator).toBe(true)
    expect(detail.data.can_act).toBe(false)
    expect(detail.data.form_data.title).toBe('t')

    // 无关用户 99 → 403
    const forbidden = await getInstDetail(req(`/insts/${instId}`, { user: 99 }))
    expect(forbidden.status).toBe(403)

    // 审批人 20 详情 can_act=true
    const asApprover = await (
      await getInstDetail(req(`/insts/${instId}`, { user: 20 }))
    ).json()
    expect(asApprover.data.can_act).toBe(true)

    // 取该 task id
    const task = listTasksByInst(instId).find((t) => !t.is_finished)!
    expect(listPendingByTask(task.id).map((a) => a.userid)).toEqual([20])

    // 非待审人 act → 403
    const wrong = await actTaskHandler(
      req(`/tasks/${task.id}/act`, {
        method: 'POST',
        user: 99,
        json: { action: 'approve' },
      }),
    )
    expect(wrong.status).toBe(403)

    // 待审人 20 approve → 通过
    const okRes = await actTaskHandler(
      req(`/tasks/${task.id}/act`, {
        method: 'POST',
        user: 20,
        json: { action: 'approve' },
      }),
    )
    expect(okRes.status).toBe(200)
    expect(getInst(instId)!.state).toBe(InstState.approved)
  })

  it('非法 action → 400', async () => {
    const defId = seedDef()
    const create = await (
      await createInstHandler(
        req('/insts', {
          method: 'POST',
          user: 10,
          json: { defId, formData: { title: 't', amount: 1 } },
        }),
      )
    ).json()
    const task = listTasksByInst(create.data.id).find((t) => !t.is_finished)!
    const res = await actTaskHandler(
      req(`/tasks/${task.id}/act`, {
        method: 'POST',
        user: 20,
        json: { action: 'nope' },
      }),
    )
    expect(res.status).toBe(400)
  })
})
