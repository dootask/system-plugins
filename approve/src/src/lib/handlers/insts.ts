import {
  badRequest,
  created,
  forbidden,
  notFound,
  ok,
  readJson,
  requireUser,
} from '#/lib/auth'
import { getUserPrimaryDept } from '#/lib/dootask-server'
import { buildEngineDeps, roleIdsOfDef } from '#/lib/engine-deps'
import { createEngine } from '#/lib/engine'
import {
  persistAttachments,
  resolveCommentImages,
  syncAttachmentShares,
} from './attachments'
import { notifyOnStart } from './notify'
import { getDef } from '#/lib/repo/defs'
import { getInst, listByInitiator } from '#/lib/repo/insts'
import {
  getActiveTask,
  listPendingForUser,
  listTasksByInst,
} from '#/lib/repo/tasks'
import {
  listActorsByInst,
  listCcForUser,
  listDoneForUser,
} from '#/lib/repo/actors'
import { addEvent, listEventsByInst } from '#/lib/repo/events'
import { validateForm } from '#/lib/form/validate'
import type { FileValue, FormSchema } from '#/lib/form/types'
import type { ProcInstRow } from '#/lib/types'
import { lastId, query } from './util'

/** 列表项摘要（列表页用）。 */
function instSummary(row: ProcInstRow) {
  return {
    id: row.id,
    def_id: row.def_id,
    title: row.title,
    initiator_id: row.initiator_id,
    status: row.status,
    state: row.state,
    cur_node_id: row.cur_node_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    finished_at: row.finished_at,
  }
}

/** POST /api/insts → 发起：{ defId, formData }。validateForm 兜底后 engine.start。 */
export async function createInstHandler(request: Request): Promise<Response> {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const body = await readJson<{
    defId?: number
    formData?: Record<string, unknown>
  }>(request)
  if (!body || !body.defId) return badRequest('缺少 defId')
  const def = getDef(body.defId)
  if (!def) return notFound('模板不存在')
  if (def.status !== 'enabled') return badRequest('该模板已停用，无法发起')

  const formData = body.formData ?? {}
  let schema: FormSchema = []
  try {
    schema = JSON.parse(def.form_schema || '[]') as FormSchema
  } catch {
    schema = []
  }
  const { valid, errors } = validateForm(schema, formData)
  if (!valid) {
    return Response.json({ error: '表单校验未通过', errors }, { status: 400 })
  }

  const token = request.headers.get('x-user-token')
  const [deptId, deps] = await Promise.all([
    getUserPrimaryDept(token),
    buildEngineDeps(token, roleIdsOfDef(def.flow_nodes)),
  ])
  const engine = createEngine(deps)
  let id: number
  try {
    id = engine.start(def.id, formData, {
      userId: auth.userId,
      deptId,
    })
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : '发起失败')
  }

  // 附件落库 + 共享给当前参与人（不阻断发起，失败仅记日志）。
  await persistAttachments(id, schema, formData, auth.userId, token)
  await syncAttachmentShares(id, token)
  // 通知：审批人（当前待办）+ 抄送人。
  await notifyOnStart(id, token)
  return created({ id })
}

/**
 * GET /api/insts?box=todo|done|cc|mine&page=&pageSize=&keyword=&status=
 * → 待处理/已处理/抄送我的/我提交的 列表，返回 { items, total }（服务端分页/过滤）。
 * 收件箱经反查+去重得到全集后在内存按 keyword(标题)/status 过滤再分页（插件量级足够）。
 */
export async function listInstsHandler(request: Request): Promise<Response> {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const box = query(request, 'box') ?? 'mine'
  const keyword = (query(request, 'keyword') ?? '').trim().toLowerCase()
  const status = query(request, 'status') ?? ''
  const page = Math.max(1, Number(query(request, 'page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query(request, 'pageSize')) || 20))

  let rows: Array<ProcInstRow>
  if (box === 'todo') {
    rows = dedupInsts(listPendingForUser(auth.userId).map((t) => getInst(t.inst_id)))
  } else if (box === 'done') {
    rows = dedupInsts(listDoneForUser(auth.userId).map((a) => getInst(a.inst_id)))
  } else if (box === 'cc') {
    rows = dedupInsts(listCcForUser(auth.userId).map((a) => getInst(a.inst_id)))
  } else {
    rows = listByInitiator(auth.userId)
  }

  if (status) rows = rows.filter((r) => r.status === status)
  if (keyword) rows = rows.filter((r) => r.title.toLowerCase().includes(keyword))
  const total = rows.length
  const start = (page - 1) * pageSize
  const items = rows.slice(start, start + pageSize).map(instSummary)
  return ok({ items, total })
}

function dedupInsts(list: Array<ProcInstRow | undefined>): Array<ProcInstRow> {
  const seen = new Set<number>()
  const out: Array<ProcInstRow> = []
  for (const r of list) {
    if (r && !seen.has(r.id)) {
      seen.add(r.id)
      out.push(r)
    }
  }
  return out
}

/** GET /api/insts/:id → 详情：inst + formData + 时间线 events + 当前 task + actors。 */
export async function getInstDetail(request: Request): Promise<Response> {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const id = lastId(request)
  if (!id) return notFound('缺少审批单 id')
  const row = getInst(id)
  if (!row) return notFound('审批单不存在')

  // 可见性：发起人 / 当前/历史参与人(审批/抄送) / 管理员。
  const actors = listActorsByInst(id)
  const isParticipant =
    row.initiator_id === auth.userId ||
    actors.some((a) => a.userid === auth.userId)
  if (!isParticipant && !auth.isAdmin) return forbidden('无权查看该审批单')

  let formData: Record<string, unknown> = {}
  let formSchema: FormSchema = []
  try {
    formData = JSON.parse(row.form_data || '{}') as Record<string, unknown>
  } catch {
    formData = {}
  }
  const def = getDef(row.def_id)
  try {
    formSchema = def ? (JSON.parse(def.form_schema || '[]') as FormSchema) : []
  } catch {
    formSchema = []
  }

  const activeTask = getActiveTask(id)
  // 当前用户可处置的待办：自己是当前 task 的 pending approver。
  const canAct =
    !!activeTask &&
    actors.some(
      (a) =>
        a.task_id === activeTask.id &&
        a.userid === auth.userId &&
        a.role === 'approver' &&
        a.action === 'pending',
    )

  return ok({
    inst: {
      ...instSummary(row),
      def_version: row.def_version,
      dept_id: row.dept_id,
    },
    form_schema: formSchema,
    form_data: formData,
    events: listEventsByInst(id),
    tasks: listTasksByInst(id),
    active_task: activeTask ?? null,
    actors,
    can_act: canAct,
    is_initiator: row.initiator_id === auth.userId,
  })
}

/**
 * POST /api/insts/:id/comment {comment} → 在审批单上留言（不改变流转状态，仅写时间线）。
 * 可见者（发起人 / 参与人 / 管理员）皆可评论。
 */
export async function commentInstHandler(
  request: Request,
  instId: number,
): Promise<Response> {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const row = getInst(instId)
  if (!row) return notFound('审批单不存在')

  const actors = listActorsByInst(instId)
  const isParticipant =
    row.initiator_id === auth.userId ||
    actors.some((a) => a.userid === auth.userId)
  if (!isParticipant && !auth.isAdmin) return forbidden('无权评论该审批单')

  const body = await readJson<{ comment?: string; images?: Array<FileValue> }>(
    request,
  )
  const text = body?.comment?.trim()
  const token = request.headers.get('x-user-token')
  const attachments = await resolveCommentImages(instId, body?.images, token)
  if (!text && attachments.length === 0)
    return badRequest('评论内容不能为空')

  addEvent({
    inst_id: instId,
    actor_id: auth.userId,
    action: 'comment',
    remark: text || null,
    attachments,
  })
  return ok({ ok: true })
}
