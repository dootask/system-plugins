import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, setDbForTesting } from '#/lib/db'
import { createDef } from '#/lib/repo/defs'
import { listAttachmentsByInst } from '#/lib/repo/attachments'
import { collectRoleIds } from '#/lib/engine'
import type { FormSchema } from '#/lib/form/types'
import type { FlowNode } from '#/lib/engine'
import { createInstHandler } from './insts'
import { uploadHandler } from './uploads'

// dootask-server 在测试环境为 no-op（无 SDK）：uploadFile 回固定文件，通知/共享空操作。
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
  uploadFile: async (_t: unknown, f: { name: string }) => ({
    id: 777,
    name: f.name,
    size: 12,
    ext: 'pdf',
  }),
  shareFilesToUsers: async () => undefined,
  getFileOne: async () => null,
  ensureApproveBot: async () => null,
  sendBotDirectMessage: async () => null,
  buildDetailCard: () => '> card',
  sendApproveCard: async () => null,
}))

// 附件本地存储写到临时目录，避免污染仓库 ./data。
process.env.APPROVE_UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'approve-up-'))

beforeEach(() => setDbForTesting(new Database(':memory:')))
afterEach(() => {
  closeDb()
  vi.clearAllMocks()
})

const BASE = 'http://x/apps/approve/api'

const SCHEMA: FormSchema = [
  { key: 'title', type: 'text', label: '标题', required: true },
  { key: 'files', type: 'file', label: '附件' },
]

const FLOW: FlowNode = {
  nodeId: 'start',
  type: 'start',
  childNode: {
    nodeId: 'a',
    type: 'approver',
    settype: 'specific',
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

describe('uploads handler', () => {
  it('无 token → 401', async () => {
    const res = await uploadHandler(
      new Request(`${BASE}/uploads`, { method: 'POST' }),
    )
    expect(res.status).toBe(401)
  })

  it('上传成功 → 返回本地 url', async () => {
    const fd = new FormData()
    fd.append('file', new Blob(['hello'], { type: 'text/plain' }), 'a.pdf')
    const res = await uploadHandler(
      new Request(`${BASE}/uploads`, {
        method: 'POST',
        headers: { 'x-user-token': 'u:10' },
        body: fd,
      }),
    )
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data.name).toBe('a.pdf')
    expect(data.size).toBe(5)
    expect(data.url).toMatch(/^\/apps\/approve\/api\/uploads\/[a-f0-9-]+$/)
  })
})

describe('发起时落库附件', () => {
  it('file 字段带 url → 写入 proc_attachment', async () => {
    const defId = seedDef()
    const url = '/apps/approve/api/uploads/00000000-0000-4000-8000-000000000000'
    const res = await createInstHandler(
      new Request(`${BASE}/insts`, {
        method: 'POST',
        headers: { 'x-user-token': 'u:10', 'content-type': 'application/json' },
        body: JSON.stringify({
          defId,
          formData: {
            title: '差旅',
            files: [{ name: 'a.pdf', url, size: 12, mime: 'application/pdf' }],
          },
        }),
      }),
    )
    expect(res.status).toBe(201)
    const { data } = await res.json()
    const atts = listAttachmentsByInst(data.id)
    expect(atts).toHaveLength(1)
    expect(atts[0].url).toBe(url)
    expect(atts[0].field_key).toBe('files')
  })
})

describe('collectRoleIds', () => {
  it('收集 settype=role 节点的 roleIds（含条件分支，去重）', () => {
    const flow: FlowNode = {
      nodeId: 'start',
      type: 'start',
      childNode: {
        nodeId: 'r',
        type: 'route',
        conditionNodes: [
          {
            nodeId: 'b1',
            conditions: [],
            childNode: {
              nodeId: 'x',
              type: 'approver',
              settype: 'role',
              roleIds: [1, 2],
            },
          },
        ],
        childNode: {
          nodeId: 'y',
          type: 'approver',
          settype: 'role',
          roleIds: [2, 3],
        },
      },
    }
    expect(collectRoleIds(flow).sort()).toEqual([1, 2, 3])
  })

  it('无 role 节点 → 空数组', () => {
    expect(collectRoleIds(FLOW)).toEqual([])
  })
})
