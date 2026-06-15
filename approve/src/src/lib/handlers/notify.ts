/**
 * 消息中心对接（handler 层）：以「审批助手(approval-alert)」机器人身份，向相关人推送
 * 还原的旧版审批模板卡片（approve_reviewer/notifier/submitter）。卡片仅展示、不与旧审批系统
 * 数据关联（主程序 /api/dialog/msg/sendapprove + 还原的 approve-*.vue 渲染）。
 *
 * 触发点（引擎动作完成后由 handler 调用，据 DB 当前状态算通知对象）：
 * - notifyOnStart：发起后 → 当前待办审批人(approve_reviewer) + 抄送人(approve_notifier)。
 * - notifyOnAdvance：推进到新节点后 → 新的待办审批人(approve_reviewer)。
 * - notifyResult：通过/驳回 → 通知发起人结果(approve_submitter)。撤回由发起人本人发起，不再通知。
 *
 * 卡片 data 贴合请假/加班（起止时间/事由/类型）；其它模板相关字段留空，模板已做 v-if 隐藏。
 * 发送失败只记日志，绝不抛错阻断审批主流程。
 */
import { getInst } from '#/lib/repo/insts'
import { getDef } from '#/lib/repo/defs'
import { getActiveTask } from '#/lib/repo/tasks'
import { listActorsByInst, listPendingByTask } from '#/lib/repo/actors'
import { addMsg } from '#/lib/repo/msgs'
import { resolveUsers, sendApproveCard } from '#/lib/dootask-server'
import type { ApproveCardType } from '#/lib/dootask-server'
import { isNotifyEnabled } from '#/lib/repo/settings'
import type { ProcInstRow } from '#/lib/types'

const STATE_APPROVED = 2
const STATE_REJECTED = 3

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
function weekOf(s: unknown): string {
  if (typeof s !== 'string' || !s) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? '' : WEEK[d.getDay()]
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** 组装卡片 data（请假/加班相关字段；其它模板留空由模板隐藏）。 */
function buildData(inst: ProcInstRow, defName: string, applicant: string) {
  let form: Record<string, unknown> = {}
  try {
    form = JSON.parse(inst.form_data || '{}') as Record<string, unknown>
  } catch {
    form = {}
  }
  return {
    id: inst.id,
    nickname: applicant,
    start_nickname: applicant,
    proc_def_name: defName,
    department: '',
    type: str(form.leaveType),
    start_time: str(form.startTime),
    start_day_of_week: weekOf(form.startTime),
    end_time: str(form.endTime),
    end_day_of_week: weekOf(form.endTime),
    description: str(form.reason) || str(form.description),
  }
}

async function notify(
  inst: ProcInstRow,
  userid: number,
  type: ApproveCardType,
  data: Record<string, unknown>,
  opts: { action?: string | null; isFinished?: boolean; title?: string },
  kind: string,
  token: string | null,
  taskId?: number | null,
): Promise<void> {
  const sent = await sendApproveCard(userid, type, data, opts, token)
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

async function nameOf(
  initiatorId: number,
  token: string | null,
): Promise<string> {
  // resolveUsers 对每个请求 id 均回填（含失败占位「用户#<id>」），故必有该键。
  const names = await resolveUsers([initiatorId], token)
  return names[initiatorId].nickname
}

/** 发起后：通知当前待办审批人 + 抄送人。 */
export async function notifyOnStart(
  instId: number,
  token: string | null,
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
  const data = buildData(inst, defName, applicant)

  await Promise.all([
    ...approvers.map((uid) =>
      notify(
        inst,
        uid,
        'approve_reviewer',
        data,
        { action: 'start', title: `${applicant} 提交的「${defName}」待你审批` },
        'reviewer',
        token,
        task?.id,
      ),
    ),
    ...ccs.map((uid) =>
      notify(
        inst,
        uid,
        'approve_notifier',
        data,
        { title: `抄送 ${applicant} 的「${defName}」` },
        'cc',
        token,
      ),
    ),
  ])
}

/** 推进后：通知新节点的待办审批人（节点未变则不重复通知）。 */
export async function notifyOnAdvance(
  instId: number,
  prevTaskId: number | null,
  token: string | null,
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
  const data = buildData(inst, defName, applicant)
  await Promise.all(
    approvers.map((uid) =>
      notify(
        inst,
        uid,
        'approve_reviewer',
        data,
        { action: 'start', title: `${applicant} 提交的「${defName}」待你审批` },
        'reviewer',
        token,
        task.id,
      ),
    ),
  )
}

/** 通过/驳回后：通知发起人结果（撤回由发起人本人发起，不再通知）。 */
export async function notifyResult(
  instId: number,
  token: string | null,
): Promise<void> {
  if (!isNotifyEnabled()) return
  const inst = getInst(instId)
  if (!inst) return
  let action: string
  if (inst.state === STATE_APPROVED) action = 'pass'
  else if (inst.state === STATE_REJECTED) action = 'refuse'
  else return

  const def = getDef(inst.def_id)
  const defName = def?.name ?? ''
  const applicant = await nameOf(inst.initiator_id, token)
  const data = buildData(inst, defName, applicant)
  const title =
    action === 'pass'
      ? `您发起的「${defName}」已通过`
      : `您发起的「${defName}」被拒绝`
  await notify(
    inst,
    inst.initiator_id,
    'approve_submitter',
    data,
    { action, isFinished: true, title },
    'result',
    token,
  )
}
