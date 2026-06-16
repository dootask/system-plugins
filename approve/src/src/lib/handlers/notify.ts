/**
 * 消息中心对接（handler 层）：以「审批」机器人（approval-alert，旧审批系统同款）向相关人
 * 推送**可点击**的审批卡片——markdown 文本 + open-micro-app 引用行，点击后主程序打开本工程
 * 详情页 `insts/$id`（对齐资产管理插件做法，DialogWrapper.handleOpenMicroApp）。
 * 沿用旧审批机器人，仅改消息内容/格式；不再用旧 approve-*.vue 模板卡片（底部按钮不可点）。
 *
 * 触发点（引擎动作完成后由 handler 调用，据 DB 当前状态算通知对象）：
 * - notifyOnStart：发起后 → 当前待办审批人 + 抄送人。
 * - notifyOnAdvance：推进到新节点后 → 新的待办审批人。
 * - notifyResult：通过/驳回 → 通知发起人结果（含状态/处理人）。撤回由发起人本人发起，不通知。
 *
 * 摘要字段贴合请假/加班（起止时间/事由/类型），其它模板缺这些字段时自动略过对应行。
 * 发送失败只记日志，绝不抛错阻断审批主流程。
 */
import { getInst } from '#/lib/repo/insts'
import { getDef } from '#/lib/repo/defs'
import { getActiveTask } from '#/lib/repo/tasks'
import { listActorsByInst, listPendingByTask } from '#/lib/repo/actors'
import { listEventsByInst } from '#/lib/repo/events'
import { addMsg } from '#/lib/repo/msgs'
import { buildDetailCard, resolveUsers, sendApprovalCard } from '#/lib/dootask-server'
import { isNotifyEnabled } from '#/lib/repo/settings'
import type { ProcInstRow } from '#/lib/types'
import type { TFunc } from '#/lib/i18n/translate'
import type { MsgKey } from '#/lib/i18n/messages'

const STATE_APPROVED = 2
const STATE_REJECTED = 3

function weekOf(s: unknown, t: TFunc): string {
  if (typeof s !== 'string' || !s) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return ''
  return t(`server.week.${d.getDay()}` as MsgKey)
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** 表单摘要行（类型/起止/事由；缺字段则略过）。不含申请人，由调用方按场景前置。 */
function formLines(inst: ProcInstRow, t: TFunc): Array<string> {
  let form: Record<string, unknown> = {}
  try {
    form = JSON.parse(inst.form_data || '{}') as Record<string, unknown>
  } catch {
    form = {}
  }
  const lines: Array<string> = []
  // 类型字段各模板 key 不一（请假为 type，部分为 leaveType），取其一。
  const type = str(form.leaveType) || str(form.type)
  if (type) lines.push(t('server.notify.type', { value: type }))
  const st = str(form.startTime)
  if (st) {
    const w = weekOf(st, t)
    lines.push(t('server.notify.start', { value: `${st}${w ? ` (${w})` : ''}` }))
  }
  const et = str(form.endTime)
  if (et) {
    const w = weekOf(et, t)
    lines.push(t('server.notify.end', { value: `${et}${w ? ` (${w})` : ''}` }))
  }
  const desc = str(form.reason) || str(form.description)
  if (desc) lines.push(t('server.notify.reason', { value: desc }))
  return lines
}

/** 发一条可点击 markdown 卡片：**标题** + 摘要行 + 「查看详情」引用行。 */
async function sendCard(
  inst: ProcInstRow,
  userid: number,
  title: string,
  bodyLines: Array<string>,
  kind: string,
  token: string | null,
  t: TFunc,
  taskId?: number | null,
): Promise<void> {
  const text = [
    `**${title}**`,
    bodyLines.join('\n'),
    buildDetailCard(inst.id, t('server.notify.viewDetail')),
  ]
    .filter(Boolean)
    .join('\n\n')
  const sent = await sendApprovalCard(userid, text, token)
  if (sent) {
    addMsg({
      inst_id: inst.id,
      task_id: taskId ?? null,
      userid,
      dialog_id: sent.dialogId,
      msg_id: sent.msgId,
      kind,
    })
  }
}

async function nameOf(userId: number, token: string | null): Promise<string> {
  // resolveUsers 对每个请求 id 均回填（含失败占位「用户#<id>」），故必有该键。
  const names = await resolveUsers([userId], token)
  return names[userId].nickname
}

/** 发起后：通知当前待办审批人 + 抄送人。 */
export async function notifyOnStart(
  instId: number,
  token: string | null,
  t: TFunc,
): Promise<void> {
  if (!isNotifyEnabled()) return
  const inst = getInst(instId)
  if (!inst) return
  const def = getDef(inst.def_id)
  const defName = def?.name ?? ''
  const actors = listActorsByInst(instId)
  const task = getActiveTask(instId)
  const approvers = task ? listPendingByTask(task.id).map((a) => a.userid) : []
  const ccs = actors.filter((a) => a.role === 'cc').map((a) => a.userid)

  const applicant = await nameOf(inst.initiator_id, token)
  const body = [
    t('server.notify.applicant', { name: applicant }),
    ...formLines(inst, t),
  ]

  await Promise.all([
    ...approvers.map((uid) =>
      sendCard(
        inst,
        uid,
        t('server.notify.toReview', { applicant, defName }),
        body,
        'reviewer',
        token,
        t,
        task?.id,
      ),
    ),
    ...ccs.map((uid) =>
      sendCard(
        inst,
        uid,
        t('server.notify.cc', { applicant, defName }),
        body,
        'cc',
        token,
        t,
      ),
    ),
  ])
}

/** 推进后：通知新节点的待办审批人（节点未变则不重复通知）。 */
export async function notifyOnAdvance(
  instId: number,
  prevTaskId: number | null,
  token: string | null,
  t: TFunc,
): Promise<void> {
  if (!isNotifyEnabled()) return
  const inst = getInst(instId)
  if (!inst) return
  const task = getActiveTask(instId)
  if (!task || task.id === prevTaskId) return

  const approvers = listPendingByTask(task.id).map((a) => a.userid)
  if (approvers.length === 0) return
  const def = getDef(inst.def_id)
  const defName = def?.name ?? ''
  const applicant = await nameOf(inst.initiator_id, token)
  const body = [
    t('server.notify.applicant', { name: applicant }),
    ...formLines(inst, t),
  ]
  await Promise.all(
    approvers.map((uid) =>
      sendCard(
        inst,
        uid,
        t('server.notify.toReview', { applicant, defName }),
        body,
        'reviewer',
        token,
        t,
        task.id,
      ),
    ),
  )
}

/** 通过/驳回后：通知发起人结果（含状态/处理人）。撤回由发起人本人发起，不再通知。 */
export async function notifyResult(
  instId: number,
  token: string | null,
  t: TFunc,
): Promise<void> {
  if (!isNotifyEnabled()) return
  const inst = getInst(instId)
  if (!inst) return
  let passed: boolean
  if (inst.state === STATE_APPROVED) passed = true
  else if (inst.state === STATE_REJECTED) passed = false
  else return

  const def = getDef(inst.def_id)
  const defName = def?.name ?? ''
  // 处理人：最后一条 approve/reject 事件的操作人。
  const last = [...listEventsByInst(instId)]
    .reverse()
    .find((e) => e.action === 'approve' || e.action === 'reject')
  const handler = last ? await nameOf(last.actor_id, token) : ''

  const statusText = passed
    ? t('server.notify.approved')
    : t('server.notify.rejected')
  const body = [
    t('server.notify.status', { value: statusText }),
    handler ? t('server.notify.handler', { name: handler }) : '',
    ...formLines(inst, t),
  ].filter(Boolean)
  await sendCard(
    inst,
    inst.initiator_id,
    passed
      ? t('server.notify.resultApproved', { defName })
      : t('server.notify.resultRejected', { defName }),
    body,
    'result',
    token,
    t,
  )
}
