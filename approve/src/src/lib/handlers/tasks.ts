import {
  badRequest,
  forbidden,
  notFound,
  ok,
  readJson,
  requireUser,
} from '#/lib/auth'
import { buildEngineDeps, roleIdsOfDef } from '#/lib/engine-deps'
import { createEngine } from '#/lib/engine'
import { getInst } from '#/lib/repo/insts'
import { getDef } from '#/lib/repo/defs'
import { getActiveTask, getTask } from '#/lib/repo/tasks'
import { listPendingByTask } from '#/lib/repo/actors'
import type { ActOptions, EngineAction } from '#/lib/engine'
import type { FileValue } from '#/lib/form/types'
import { resolveCommentImages, syncAttachmentShares } from './attachments'
import { notifyOnAdvance, notifyResult } from './notify'
import { idAfter } from './util'

const ACTIONS: ReadonlySet<EngineAction> = new Set([
  'approve',
  'reject',
  'return',
  'withdraw',
  'transfer',
  'addsign',
])

interface ActBody {
  action?: EngineAction
  comment?: string
  /** 审批意见附带的图片（approve/reject/return/withdraw 写入对应事件）。 */
  images?: Array<FileValue>
  transferTo?: number
  addsignTo?: Array<number>
  returnTo?: 'initiator' | string
  /** return 后由发起人续提交时可携带新表单（仅发起人本人有效）。 */
  resubmitForm?: Record<string, unknown>
}

/**
 * POST /api/tasks/:id/act → 处置任务。:id 为 proc_task.id。
 * 鉴权：approve/reject/return/transfer/addsign 仅当前 task 的 pending approver 可做；
 *       withdraw 仅发起人可做（引擎内再校验未有人审过）。
 * 退回(return)后若带 resubmitForm 且操作者是发起人 → 引擎 resubmit 续审。
 */
export async function actTaskHandler(request: Request): Promise<Response> {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const taskId = idAfter(request, 'tasks')
  if (!taskId) return notFound('缺少任务 id')
  const task = getTask(taskId)
  if (!task) return notFound('任务不存在')
  const inst = getInst(task.inst_id)
  if (!inst) return notFound('审批单不存在')

  const body = await readJson<ActBody>(request)
  const action = body?.action
  if (!action || !ACTIONS.has(action)) return badRequest('非法 action')

  // 权限：withdraw 限发起人；其余动作限当前 task 的 pending approver。
  if (action === 'withdraw') {
    if (auth.userId !== inst.initiator_id) {
      return forbidden('只能撤回本人发起的审批')
    }
  } else {
    const isPending = listPendingByTask(taskId).some(
      (a) => a.userid === auth.userId,
    )
    if (!isPending) return forbidden('您不是当前待审人或已处理过')
  }

  const token = request.headers.get('x-user-token')
  const def = getDef(inst.def_id)
  const deps = await buildEngineDeps(token, roleIdsOfDef(def?.flow_nodes))
  const engine = createEngine(deps)

  // 审批意见图片：解析内容直链并共享给参与人，随事件入库。
  const attachments = await resolveCommentImages(inst.id, body.images, token)

  // body 在 action 守卫后已非 null。
  const opts: ActOptions = {
    comment: body.comment,
    attachments: attachments.length > 0 ? attachments : undefined,
    transferTo: body.transferTo,
    addsignTo: body.addsignTo,
    returnTo: body.returnTo,
  }

  // 推进前活动任务，用于判断动作是否使节点前进（变化才通知下一审批人）。
  const prevTask = getActiveTask(inst.id)
  try {
    engine.act(inst.id, auth.userId, action, opts)
    // 退回后由发起人续提交（带新表单则用新表单重新展开）。
    if (action === 'return' && auth.userId === inst.initiator_id) {
      engine.resubmit(inst.id, body.resubmitForm)
    }
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : '操作失败')
  }

  // 通知 + 附件共享（不阻断响应，失败仅记日志）。
  await syncAttachmentShares(inst.id, token)
  await notifyOnAdvance(inst.id, prevTask?.id ?? null, token)
  await notifyResult(inst.id, token)
  return ok({ ok: true })
}

/**
 * POST /api/insts/:id/resubmit → 退回后发起人改表单重新提交（独立入口，便于前端调用）。
 * 仅发起人可做；引擎校验 state 必须为 pending(退回待修改)。
 */
export async function resubmitHandler(
  request: Request,
  instId: number,
): Promise<Response> {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const inst = getInst(instId)
  if (!inst) return notFound('审批单不存在')
  if (auth.userId !== inst.initiator_id) return forbidden('仅发起人可重新提交')
  const body = await readJson<{ formData?: Record<string, unknown> }>(request)

  const token = request.headers.get('x-user-token')
  const def = getDef(inst.def_id)
  const deps = await buildEngineDeps(token, roleIdsOfDef(def?.flow_nodes))
  const engine = createEngine(deps)
  const prevTask = getActiveTask(instId)
  try {
    engine.resubmit(instId, body?.formData)
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : '重新提交失败')
  }
  await syncAttachmentShares(instId, token)
  await notifyOnAdvance(instId, prevTask?.id ?? null, token)
  return ok({ ok: true })
}
