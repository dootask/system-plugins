import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, Check, ImagePlus, Loader2, X } from 'lucide-react'
import { cn } from '#/lib/utils'
import { api, ApiError, uploadFile } from '#/lib/api'
import { confirmAction, previewImage, warnMessage } from '#/lib/dootask'
import { FormRenderer } from '#/components/form/FormRenderer'
import { pickUsers } from '#/lib/form/picker'
import { useUsers } from '#/lib/use-users'
import { UserAvatar, UserChip } from '#/components/ui/user-chip'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { Badge } from '#/components/ui/badge'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  ErrorBar,
  Loading,
  StatusBadge,
  SubPageBreadcrumb,
  formatTime,
} from '#/components/ui/misc'
import type { FileValue } from '#/lib/form/types'
import type {
  CommentImage,
  InstDetail as InstDetailData,
  ProcEventRow,
  UserLite,
} from '#/lib/types'

// 引擎运行态：0待审(退回待修改)/1审批中/2通过/3拒绝/4撤回。
const STATE_RUNNING = 1
const STATE_RETURNED = 0

const EVENT_LABEL: Record<string, string> = {
  submit: '发起',
  approve: '通过',
  reject: '拒绝',
  return: '退回',
  withdraw: '撤回',
  transfer: '转交',
  addsign: '加签',
  comment: '评论',
  archive: '归档',
}

// 参与人处理状态标签 + 配色（不同状态用不同颜色区分）。
const ACTION_META: Record<string, { label: string; cls: string }> = {
  pending: {
    label: '待处理',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  approved: {
    label: '已同意',
    cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  },
  rejected: {
    label: '已拒绝',
    cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  },
  returned: {
    label: '已退回',
    cls: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  },
  withdrawn: { label: '已撤回', cls: 'bg-muted text-muted-foreground' },
  // 节点已收口（被拒/退回/整单终态）后，未表态的会签/依次审批人显示「未处理」而非「待处理」。
  skipped: { label: '未处理', cls: 'bg-muted text-muted-foreground' },
}

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? {
    label: action,
    cls: 'bg-muted text-muted-foreground',
  }
  return (
    <Badge className={cn('border-transparent', meta.cls)}>{meta.label}</Badge>
  )
}

// 审批方式标签。
const MODE_LABEL: Record<string, string> = {
  or: '或签',
  cosign: '会签',
  sequence: '依次',
}
// 结束节点按实例运行态显示结果。
const END_NOTE: Record<number, string> = {
  0: '退回待修改',
  1: '审批中',
  2: '已通过',
  3: '已拒绝',
  4: '已撤回',
}

export function InstDetailView({
  instId,
  backTo,
}: {
  instId: number
  backTo?: string
}) {
  const [data, setData] = useState<InstDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 操作区状态。
  const [comment, setComment] = useState('')
  const [images, setImages] = useState<Array<FileValue>>([])
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // 退回后发起人改表单续提交。
  const [editValue, setEditValue] = useState<Record<string, unknown>>({})

  async function load() {
    try {
      const d = await api<InstDetailData>(`/insts/${instId}`)
      setData(d)
      setEditValue(d.form_data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instId])

  // 收集所有出现过的用户 id 供昵称解析。
  const userIds = data
    ? [
        data.inst.initiator_id,
        ...data.actors.map((a) => a.userid),
        ...data.events.map((e) => e.actor_id),
      ]
    : []
  const userOf = useUsers(userIds)

  if (loading) return <Loading center />
  if (error || !data)
    return (
      <div className="space-y-4">
        <SubPageBreadcrumb parent={backTo} current={`审批详情 #${instId}`} />
        <ErrorBar message={error ?? '审批单不存在'} />
      </div>
    )

  const { inst, can_act, is_initiator } = data
  const activeTaskId = data.active_task?.id ?? null
  // 撤回：发起人 + 审批中 + 当前节点尚无人审过（pending==total）。
  const canWithdraw =
    is_initiator &&
    inst.state === STATE_RUNNING &&
    !!data.active_task &&
    data.active_task.pending_count === data.active_task.total_approvers
  // 退回待修改：发起人 + state=0。
  const canResubmit = is_initiator && inst.state === STATE_RETURNED

  async function runAct(
    action: string,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    if (!activeTaskId) return
    setBusy(true)
    setActionError(null)
    try {
      await api(`/tasks/${activeTaskId}/act`, {
        method: 'POST',
        json: {
          action,
          comment: comment.trim() || undefined,
          images: images.length ? images : undefined,
          ...extra,
        },
      })
      setComment('')
      setImages([])
      await load()
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  async function withdraw(): Promise<void> {
    if (!activeTaskId) return
    if (
      !(await confirmAction(
        '确认撤回该审批单？撤回后流程结束，不可恢复。',
        '撤回审批单',
      ))
    )
      return
    setBusy(true)
    setActionError(null)
    try {
      await api(`/tasks/${activeTaskId}/act`, {
        method: 'POST',
        json: {
          action: 'withdraw',
          comment: comment.trim() || undefined,
          images: images.length ? images : undefined,
        },
      })
      setComment('')
      setImages([])
      await load()
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : '撤回失败')
    } finally {
      setBusy(false)
    }
  }

  async function transfer(): Promise<void> {
    const r = await pickUsers({ multiple: false })
    if (r.status !== 'picked') return
    await runAct('transfer', { transferTo: r.ids[0] })
  }

  async function addsign(): Promise<void> {
    const r = await pickUsers({ multiple: true })
    if (r.status !== 'picked') return
    await runAct('addsign', { addsignTo: r.ids })
  }

  async function resubmit(): Promise<void> {
    setBusy(true)
    setActionError(null)
    try {
      await api(`/insts/${instId}/resubmit`, {
        method: 'POST',
        json: { formData: editValue },
      })
      await load()
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : '重新提交失败')
    } finally {
      setBusy(false)
    }
  }

  async function postComment(): Promise<void> {
    const text = comment.trim()
    if (!text && images.length === 0) {
      await warnMessage('请先填写评论内容或添加图片')
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      await api(`/insts/${instId}/comment`, {
        method: 'POST',
        json: {
          comment: text || undefined,
          images: images.length ? images : undefined,
        },
      })
      setComment('')
      setImages([])
      await load()
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : '评论失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <SubPageBreadcrumb parent={backTo} current={`审批详情 #${instId}`} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-lg font-semibold">{inst.title}</h1>
        <StatusBadge status={inst.status} />
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <UserChip user={userOf(inst.initiator_id)} />·
          {formatTime(inst.created_at)}
        </span>
      </div>

      {/* 表单 */}
      <Section title="表单内容">
        {canResubmit ? (
          <>
            <Alert className="mb-3 border-amber-300 text-amber-800 dark:border-amber-900 dark:text-amber-300 [&>svg]:text-amber-600">
              <AlertCircle />
              <AlertDescription className="text-amber-800 dark:text-amber-300">
                审批单已退回，请修改后重新提交。
              </AlertDescription>
            </Alert>
            <FormRenderer
              schema={data.form_schema}
              value={editValue}
              onChange={setEditValue}
            />
          </>
        ) : (
          <FormRenderer
            schema={data.form_schema}
            value={data.form_data}
            readOnly
          />
        )}
      </Section>

      {/* 流程进度 */}
      {data.flow.length > 0 && (
        <Section title="流程进度">
          <FlowProgress data={data} userOf={userOf} />
        </Section>
      )}

      {/* 操作区 + 评论 */}
      <Section title="操作">
        {actionError ? <ErrorBar message={actionError} /> : null}
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="填写审批意见 / 评论（可选）"
          rows={2}
        />
        <CommentImageInput images={images} onChange={setImages} disabled={busy} />
        <div className="mt-3 flex flex-wrap gap-2">
          {can_act ? (
            <>
              <Button onClick={() => runAct('approve')} disabled={busy}>
                同意
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (await confirmAction('确认拒绝该审批？', '拒绝审批'))
                    runAct('reject')
                }}
                disabled={busy}
              >
                拒绝
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  if (await confirmAction('确认退回给发起人修改？', '退回修改'))
                    runAct('return', { returnTo: 'initiator' })
                }}
                disabled={busy}
              >
                退回
              </Button>
              <Button variant="outline" onClick={transfer} disabled={busy}>
                转交
              </Button>
              <Button variant="outline" onClick={addsign} disabled={busy}>
                加签
              </Button>
            </>
          ) : null}
          {canWithdraw ? (
            <Button variant="outline" onClick={withdraw} disabled={busy}>
              撤回
            </Button>
          ) : null}
          {canResubmit ? (
            <Button onClick={resubmit} disabled={busy}>
              重新提交
            </Button>
          ) : null}
          <Button variant="secondary" onClick={postComment} disabled={busy}>
            仅评论
          </Button>
        </div>
        {!can_act && !canWithdraw && !canResubmit ? (
          <p className="mt-2 text-xs text-muted-foreground">
            你当前无可执行的审批操作，可留言评论。
          </p>
        ) : null}
      </Section>

      {/* 时间线 */}
      <Section title="流程时间线">
        <Timeline events={data.events} userOf={userOf} />
      </Section>
    </div>
  )
}

// 详情页区块：shadcn Card + 统一小标题。
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

type StepStatus = 'done' | 'active' | 'rejected' | 'future'

function StepDot({ status }: { status: StepStatus }) {
  const base =
    'flex size-5 shrink-0 items-center justify-center rounded-full border-2'
  if (status === 'done')
    return (
      <span className={cn(base, 'border-green-500 bg-green-500 text-white')}>
        <Check className="size-3" />
      </span>
    )
  if (status === 'rejected')
    return (
      <span className={cn(base, 'border-red-500 bg-red-500 text-white')}>
        <X className="size-3" />
      </span>
    )
  if (status === 'active')
    // 进行中：蓝色实心点 + 向外扩散的波纹环（animate-ping），安静的「进行中」语义。
    return (
      <span className={cn(base, 'relative border-transparent')}>
        <span className="absolute inset-0 animate-ping rounded-full bg-blue-500 opacity-60" />
        <span className="relative size-2.5 rounded-full bg-blue-500" />
      </span>
    )
  return <span className={cn(base, 'border-muted-foreground/30 bg-background')} />
}

interface StepPerson {
  uid: number
  action: string
  role?: string
  comment?: string | null
  /** 仅展示用户、不显示动作徽标（发起人/抄送人）。 */
  plain?: boolean
}
interface FlowStep {
  key: string
  title: string
  mode?: string
  status: StepStatus
  note?: string
  people: Array<StepPerson>
}

/** 流程进度：按 node_sequence 渲染竖向步骤条（含未到节点），每节点显示审批人与状态。 */
function FlowProgress({
  data,
  userOf,
}: {
  data: InstDetailData
  userOf: (id: number) => UserLite
}) {
  const { flow, cur_node_seq_idx, actors, tasks, inst } = data
  const instClosed =
    inst.state === 2 || inst.state === 3 || inst.state === 4
  // 同一节点可能因「退回→重新提交」多轮重开（多条 proc_task）；进度只取最新一轮，
  // 否则历史轮次的参与人会与当前轮叠加，呈现重复 + 过期状态。
  const latestTaskAt = (i: number) => {
    let latest: (typeof tasks)[number] | undefined
    for (const t of tasks)
      if (t.node_seq_idx === i && (!latest || t.id > latest.id)) latest = t
    return latest
  }
  const actorsAt = (i: number) => {
    const lt = latestTaskAt(i)
    return actors.filter(
      (a) =>
        a.node_seq_idx === i &&
        (a.role === 'approver' || a.role === 'addsign') &&
        (lt ? a.task_id === lt.id : true),
    )
  }
  const nodeStatus = (i: number): StepStatus => {
    if (actorsAt(i).some((a) => a.action === 'rejected')) return 'rejected'
    if (latestTaskAt(i)?.is_finished) return 'done'
    if (i < cur_node_seq_idx) return 'done'
    if (i === cur_node_seq_idx && inst.state === STATE_RUNNING) return 'active'
    return 'future'
  }
  // 节点已收口（最新任务已结束 / 整单终态）后，剩余 pending 的会签人显示「未处理」。
  const nodeClosed = (i: number) =>
    latestTaskAt(i)?.is_finished === 1 || instClosed

  const steps: Array<FlowStep> = []
  flow.forEach((node, i) => {
    if (node.type === 'start') {
      steps.push({
        key: `s${i}`,
        title: '发起',
        status: 'done',
        people: [{ uid: inst.initiator_id, action: '', plain: true }],
      })
      return
    }
    if (node.type === 'notifier') {
      const reached = actorsAt(i)
      const ids = reached.length
        ? reached.map((a) => a.userid)
        : node.approverIds
      steps.push({
        key: `n${i}`,
        title: '抄送',
        status: i <= cur_node_seq_idx ? 'done' : 'future',
        people: ids.map((uid) => ({ uid, action: '', plain: true })),
      })
      return
    }
    // approver（含自审自动通过 isSystem）
    const reached = actorsAt(i)
    const closed = nodeClosed(i)
    const people: Array<StepPerson> = reached.length
      ? reached.map((a) => ({
          uid: a.userid,
          // 节点已收口仍 pending = 没轮到表态就结束了 → 未处理（而非待处理）。
          action: a.action === 'pending' && closed ? 'skipped' : a.action,
          role: a.role,
          comment: a.comment,
        }))
      : node.approverIds.map((uid) => ({ uid, action: 'pending' }))
    steps.push({
      key: `a${i}`,
      title: node.name || '审批',
      mode: people.length > 1 ? node.approveMode : undefined,
      status: nodeStatus(i),
      note: node.isSystem ? '自动通过' : undefined,
      people,
    })
  })
  steps.push({
    key: 'end',
    title: '结束',
    status:
      inst.state === 2 ? 'done' : inst.state === 3 || inst.state === 4 ? 'rejected' : 'future',
    note: END_NOTE[inst.state],
    people: [],
  })

  return (
    <ol>
      {steps.map((step, idx) => (
        <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
          {idx < steps.length - 1 ? (
            <span className="absolute left-2.5 top-5 h-[calc(100%-0.5rem)] w-px -translate-x-1/2 bg-border" />
          ) : null}
          <StepDot status={step.status} />
          <div className="-mt-0.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{step.title}</span>
              {step.mode ? (
                <Badge variant="outline" className="text-xs">
                  {MODE_LABEL[step.mode] ?? step.mode}
                </Badge>
              ) : null}
              {step.note ? (
                <span className="text-xs text-muted-foreground">{step.note}</span>
              ) : null}
            </div>
            {step.people.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {step.people.map((p, j) => (
                  <li
                    key={`${p.uid}-${j}`}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <UserChip user={userOf(p.uid)} />
                    {p.role === 'addsign' ? (
                      <Badge variant="outline" className="text-xs">
                        加签
                      </Badge>
                    ) : null}
                    {p.plain ? null : <ActionBadge action={p.action} />}
                    {p.comment ? (
                      <span className="text-xs text-muted-foreground">
                        · {p.comment}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

function Timeline({
  events,
  userOf,
}: {
  events: Array<ProcEventRow>
  userOf: (id: number) => UserLite
}) {
  if (events.length === 0)
    return <p className="text-sm text-muted-foreground">暂无记录</p>
  // 最新的在最上面（事件本身按时间正序，这里倒序展示）。
  return (
    <ol className="space-y-4">
      {[...events].reverse().map((e) => (
        <li key={e.id} className="flex gap-3">
          <UserAvatar user={userOf(e.actor_id)} size="sm" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-medium">{userOf(e.actor_id).nickname}</span>{' '}
              <span className="text-muted-foreground">
                {EVENT_LABEL[e.action] ?? e.action}
              </span>
            </p>
            {e.remark ? (
              <p className="text-sm text-muted-foreground">{e.remark}</p>
            ) : null}
            {e.attachments && e.attachments.length > 0 ? (
              <CommentThumbs images={e.attachments} />
            ) : null}
            <p className="text-xs text-muted-foreground">
              {formatTime(e.created_at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** 时间线里展示评论/意见附带的图片缩略图，点击用主程序图片预览查看（支持左右切换）。 */
function CommentThumbs({ images }: { images: Array<CommentImage> }) {
  const list = images.filter((im) => im.url).map((im) => ({ src: im.url }))
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {images.map((img, i) =>
        img.url ? (
          <button
            key={i}
            type="button"
            onClick={() =>
              previewImage(
                list,
                Math.max(
                  0,
                  list.findIndex((x) => x.src === img.url),
                ),
              )
            }
            className="img-checkerboard block size-20 overflow-hidden rounded-md"
          >
            <img
              src={img.url}
              alt={img.name}
              loading="lazy"
              className="size-full cursor-zoom-in object-cover"
            />
          </button>
        ) : (
          <span
            key={i}
            className="rounded-md border px-2 py-1 text-xs text-muted-foreground"
          >
            {img.name}
          </span>
        ),
      )}
    </div>
  )
}

/** 评论/意见图片选择器：选取即上传到插件本地存储（回填 url），直接用 url 预览。 */
function CommentImageInput({
  images,
  onChange,
  disabled,
}: {
  images: Array<FileValue>
  onChange: (v: Array<FileValue>) => void
  disabled?: boolean
}) {
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const valueRef = useRef(images)
  valueRef.current = images

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setError(null)
    setUploading((n) => n + files.length)
    for (const f of files) {
      try {
        const up = await uploadFile(f)
        onChange([
          ...valueRef.current,
          { name: up.name, url: up.url, size: up.size, mime: up.mime },
        ])
      } catch (err) {
        setError(err instanceof ApiError ? err.message : `「${f.name}」上传失败`)
      } finally {
        setUploading((n) => Math.max(0, n - 1))
      }
    }
  }

  const remove = (i: number) => {
    onChange(images.filter((_, j) => j !== i))
  }

  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 || uploading > 0 ? (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div
              key={`${img.url}-${i}`}
              className="group img-checkerboard relative size-16 overflow-hidden rounded-md"
            >
              <img
                src={img.url}
                alt={img.name}
                className="size-full cursor-zoom-in object-cover"
                onClick={() =>
                  previewImage(
                    images.map((im) => ({ src: im.url })),
                    i,
                  )
                }
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute right-0 top-0 hidden rounded-bl bg-black/60 p-0.5 text-white group-hover:block"
                aria-label="移除"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          {uploading > 0 ? (
            <div className="flex size-16 items-center justify-center rounded-md border">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ImagePlus className="size-4" /> 添加图片
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onPick}
          disabled={disabled}
        />
      </label>
    </div>
  )
}

