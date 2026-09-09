import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { closeDb, getDb, setDbForTesting } from '#/lib/db'
import { createEngine, InstState } from '#/lib/engine'
import { createDef } from '#/lib/repo/defs'
import {
  countForExport,
  createInst,
  getInst,
  listForExport,
  updateInst,
} from '#/lib/repo/insts'
import {
  createTask,
  getActiveTask,
  listPendingForUser,
  listTasksByInst,
} from '#/lib/repo/tasks'
import { listActorsByInst, listDoneForUser } from '#/lib/repo/actors'
import { addMsg, listMsgsByInst } from '#/lib/repo/msgs'
import { lastDecisionByInst, listEventsByInst } from '#/lib/repo/events'
import { listAdminInstsHandler, voidInstHandler } from './admin-insts'
import { getInstDetail } from './insts'
import { statsHandler } from './stats'
import { actTaskHandler } from './tasks'

vi.mock('#/lib/dootask-server', () => ({
  verifyUserToken: async (token: string | null) =>
    token ? { userid: Number(token), nickname: `User ${token}` } : null,
}))

beforeEach(() => {
  vi.stubEnv('APPROVE_ADMIN_USER_IDS', '1')
  setDbForTesting(new Database(':memory:'))
})
afterEach(() => {
  closeDb()
  vi.unstubAllEnvs()
})

function req(path: string, user?: number, body?: unknown) {
  return new Request(`http://x/apps/approve/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(user ? { 'x-user-token': String(user) } : {}),
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function start() {
  const def = createDef(
    {
      name: 'Void regression',
      form_schema: '[]',
      flow_nodes: JSON.stringify({
        nodeId: 'start',
        type: 'start',
        childNode: {
          nodeId: 'a',
          type: 'approver',
          settype: 'specific',
          approveMode: 'cosign',
          userIds: [20, 21],
        },
      }),
    },
    1,
  )
  return createEngine().start(
    def.id,
    { title: 'Void regression' },
    { userId: 10 },
  )
}

const voidRequest = (
  id: number,
  user = 1,
  reason: unknown = 'Duplicate request',
) => voidInstHandler(req(`/admin/insts/${id}/void`, user, { reason }))

describe('管理员作废', () => {
  it('管理员列表与操作均拒绝未登录和普通用户', async () => {
    const id = start()
    for (const user of [undefined, 10, 20]) {
      const status = user ? 403 : 401
      expect(
        (await listAdminInstsHandler(req('/admin/insts', user))).status,
      ).toBe(status)
      expect(
        (
          await voidInstHandler(
            req(`/admin/insts/${id}/void`, user, { reason: 'test' }),
          )
        ).status,
      ).toBe(status)
    }
    expect(getInst(id)!.status).toBe('running')
  })

  it.each([undefined, null, 123, {}, '', '   ', 'x'.repeat(1001)])(
    '拒绝无效原因 %j',
    async (reason) => {
      const id = start()
      expect(
        (await voidInstHandler(req(`/admin/insts/${id}/void`, 1, { reason })))
          .status,
      ).toBe(400)
      expect(getInst(id)!.status).toBe('running')
      expect(listEventsByInst(id)).toHaveLength(1)
    },
  )

  it('实例不存在返回 404', async () => {
    expect((await voidRequest(99999)).status).toBe(404)
  })

  it('作废部分会签：保留已审批记录，结束所有残留任务与加签待办，保留附件/消息/历史', async () => {
    const id = start()
    const engine = createEngine()
    engine.act(id, 20, 'addsign', { addsignTo: [22] })
    engine.act(id, 20, 'approve', { comment: 'Approved before void' })
    const task = getActiveTask(id)!
    const message = addMsg({
      inst_id: id,
      task_id: task.id,
      userid: 21,
      kind: 'reviewer',
      msg_id: 123,
    })
    createTask({ inst_id: id, node_id: 'orphan', node_seq_idx: 2 })
    getDb()
      .prepare(
        'INSERT INTO proc_attachment (inst_id, uploaded_by, name, local_path) VALUES (?, ?, ?, ?)',
      )
      .run(id, 10, 'test.txt', 'test.txt')
    const before = listEventsByInst(id)
    const adminDetail = await (
      await getInstDetail(req(`/insts/${id}`, 1))
    ).json()
    expect(adminDetail.data.can_void).toBe(true)
    expect(
      (await (await getInstDetail(req(`/insts/${id}`, 21))).json()).data
        .can_void,
    ).toBe(false)
    expect((await voidRequest(id, 1, '  Duplicate request  ')).status).toBe(200)
    const inst = getInst(id)!
    expect(inst.status).toBe('voided')
    expect(inst.state).toBe(InstState.voided)
    expect(inst.finished_at).toBeTruthy()
    expect(JSON.parse(inst.form_data).title).toBe('Void regression')
    expect(getActiveTask(id)).toBeUndefined()
    expect(
      listTasksByInst(id).every((t) => t.is_finished && t.state === 'voided'),
    ).toBe(true)
    expect(listActorsByInst(id).find((a) => a.userid === 20)).toMatchObject({
      action: 'approved',
      comment: 'Approved before void',
    })
    for (const user of [21, 22]) {
      expect(listPendingForUser(user)).toHaveLength(0)
      expect(listDoneForUser(user)).toHaveLength(0)
      const detail = await (
        await getInstDetail(req(`/insts/${id}`, user))
      ).json()
      expect(detail.data.can_act).toBe(false)
      expect(detail.data.can_void).toBe(false)
      expect(
        (
          await actTaskHandler(
            req(`/tasks/${task.id}/act`, user, { action: 'approve' }),
          )
        ).status,
      ).toBe(403)
    }
    expect(listDoneForUser(20)).toHaveLength(1)
    expect(listEventsByInst(id).slice(0, -1)).toEqual(before)
    expect(listEventsByInst(id).at(-1)).toMatchObject({
      actor_id: 1,
      action: 'void',
      remark: 'Duplicate request',
    })
    expect(lastDecisionByInst().get(id)).toMatchObject({
      action: 'void',
      remark: 'Duplicate request',
    })
    expect(listMsgsByInst(id)).toEqual([message])
    expect(
      getDb()
        .prepare('SELECT COUNT(*) AS c FROM proc_attachment WHERE inst_id = ?')
        .get(id),
    ).toEqual({ c: 1 })
  })

  it('退回待修改的审批也可作废，作废后不能重新提交或撤回', async () => {
    const id = start()
    const engine = createEngine()
    engine.act(id, 20, 'return', { returnTo: 'initiator' })
    expect(getInst(id)!.state).toBe(InstState.pending)
    expect(getActiveTask(id)).toBeUndefined()
    expect((await voidRequest(id)).status).toBe(200)
    expect(() => engine.resubmit(id, undefined)).toThrow()
    expect(() => engine.act(id, 10, 'withdraw')).toThrow()
    expect(getInst(id)!.status).toBe('voided')
    expect(listActorsByInst(id).find((a) => a.userid === 20)!.action).toBe(
      'returned',
    )
  })

  it.each(['approved', 'rejected', 'withdrawn', 'archived', 'voided'])(
    '不能作废已结束审批 %s',
    async (status) => {
      const id = start()
      updateInst(id, { status, state: status === 'voided' ? 5 : 2 })
      expect((await voidRequest(id)).status).toBe(400)
      expect(getInst(id)!.status).toBe(status)
      expect(listEventsByInst(id)).toHaveLength(1)
    },
  )

  it('重复作废不重复写入事件', async () => {
    const id = start()
    expect((await voidRequest(id)).status).toBe(200)
    expect((await voidRequest(id)).status).toBe(400)
    expect(
      listEventsByInst(id).filter((e) => e.action === 'void'),
    ).toHaveLength(1)
  })

  it('事件写入失败时，实例、任务、参与人状态全部回滚', () => {
    const id = start()
    const before = {
      inst: getInst(id),
      tasks: listTasksByInst(id),
      actors: listActorsByInst(id),
    }
    getDb().exec(
      "CREATE TRIGGER fail_void BEFORE INSERT ON proc_event WHEN NEW.action = 'void' BEGIN SELECT RAISE(ABORT, 'test failure'); END",
    )
    expect(() => createEngine().void(id, 1, 'test')).toThrow('test failure')
    expect({
      inst: getInst(id),
      tasks: listTasksByInst(id),
      actors: listActorsByInst(id),
    }).toEqual(before)
  })

  it('列表支持全量查询/分页/状态/字面标题过滤；作废不计有效统计和默认导出，可单独导出', async () => {
    const id = start()
    const first = getInst(id)!
    createInst({
      def_id: first.def_id,
      def_version: 1,
      initiator_id: 10,
      title: 'Another approval',
    })
    await voidRequest(id)
    const list = async (query: string) =>
      (
        await (
          await listAdminInstsHandler(req(`/admin/insts?${query}`, 1))
        ).json()
      ).data
    expect((await list('')).total).toBe(2)
    expect((await list('pageSize=1')).items).toHaveLength(1)
    expect((await list('pageSize=1&page=2')).items[0].id).toBe(id)
    expect(
      (await list('status=voided')).items.map((r: { id: number }) => r.id),
    ).toEqual([id])
    expect((await list('keyword=Void')).total).toBe(1)
    expect((await list('keyword=%')).total).toBe(0)
    expect((await list('page=Infinity&pageSize=NaN')).items).toHaveLength(2)
    for (const user of [1, 10]) {
      const stats = (await (await statsHandler(req('/stats', user))).json())
        .data
      expect(stats.total).toBe(1)
      expect(stats.byStatus.voided).toBeUndefined()
    }
    expect(countForExport({})).toBe(1)
    expect(listForExport({}).some((r) => r.id === id)).toBe(false)
    expect(countForExport({ statuses: ['voided'] })).toBe(1)
    expect(listForExport({ statuses: ['voided'] }).map((r) => r.id)).toEqual([
      id,
    ])
  })
})
