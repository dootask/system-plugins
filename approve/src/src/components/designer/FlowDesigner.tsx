import * as React from 'react'
import { Plus, Trash2, Users, X } from 'lucide-react'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Drawer as DrawerRoot,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '#/components/ui/drawer'
import { pickUsers } from '#/lib/form/picker'
import { useUsers } from '#/lib/use-users'
import { UserChip } from '#/components/ui/user-chip'
import {
  APPROVE_MODE_LABEL,
  OP_LABEL,
  SET_TYPE_LABEL,
  addBranch,
  conditionFields,
  insertAfter,
  insertInBranch,
  makeApprover,
  makeCondition,
  makeNotifier,
  makeRoute,
  removeBranch,
  removeNode,
  updateBranch,
  updateNode,
} from '#/lib/designer/utils'
import type { ConditionField } from '#/lib/designer/utils'
import type { ApproveMode, SetType } from '#/lib/engine/types'
import type { Condition, ConditionBranch, FlowNode } from '#/lib/engine/flow'
import type { FormSchema } from '#/lib/form/types'

// ────────────────────────────────────────────────────────────────────────
// 流程设计器（React 重写旧 workflow-vue3 画布）：垂直单链 + 条件分支并列。
// 节点：发起人(start) / 审批人(approver) / 抄送人(notifier) / 条件分支(route)。
// 产出 FlowNode 树，能被 lib/engine expandFlow 直接展开。
// 条件分支字段来源 = 该模板 form_schema 的数值/单选字段。
// ────────────────────────────────────────────────────────────────────────

// Radix Select 的 value 不能是空串，用哨兵代表条件「未选值」。
const COND_VALUE_NONE = '__none__'

export function FlowDesigner({
  value,
  schema,
  onChange,
}: {
  value: FlowNode
  schema: FormSchema
  onChange: (next: FlowNode) => void
}) {
  // 当前编辑的节点/分支 id（打开右侧配置面板）。
  const [editNodeId, setEditNodeId] = React.useState<string | null>(null)
  const [editBranch, setEditBranch] = React.useState<string | null>(null)
  const condFields = React.useMemo(() => conditionFields(schema), [schema])

  const addAfter = (
    parentId: string,
    kind: 'approver' | 'notifier' | 'route',
  ) => {
    const node =
      kind === 'approver'
        ? makeApprover()
        : kind === 'notifier'
          ? makeNotifier()
          : makeRoute()
    onChange(insertAfter(value, parentId, node))
  }
  const addInBranch = (
    branchId: string,
    kind: 'approver' | 'notifier' | 'route',
  ) => {
    const node =
      kind === 'approver'
        ? makeApprover()
        : kind === 'notifier'
          ? makeNotifier()
          : makeRoute()
    onChange(insertInBranch(value, branchId, node))
  }

  return (
    <>
      {/* 横向溢出时用 w-max + mx-auto：内容窄于容器则居中，宽于容器则靠左且左右都能滚到底
          （直接 items-center 会把左侧溢出裁掉、滚不到最左）。 */}
      <div className="overflow-x-auto py-4">
        <div className="mx-auto flex w-max flex-col items-center px-6">
          <NodeChain
            node={value}
            onAddAfter={addAfter}
            onAddInBranch={addInBranch}
            onEditNode={setEditNodeId}
            onEditBranch={setEditBranch}
            onDeleteNode={(id) => onChange(removeNode(value, id))}
            onAddBranch={(routeId) => onChange(addBranch(value, routeId))}
            onDeleteBranch={(routeId, branchId) =>
              onChange(removeBranch(value, routeId, branchId))
            }
            condFields={condFields}
          />
        </div>
      </div>

      {editNodeId ? (
        <NodeConfigPanel
          root={value}
          nodeId={editNodeId}
          onClose={() => setEditNodeId(null)}
          onChange={(patch) => onChange(updateNode(value, editNodeId, patch))}
        />
      ) : null}
      {editBranch ? (
        <BranchConfigPanel
          root={value}
          branchId={editBranch}
          condFields={condFields}
          onClose={() => setEditBranch(null)}
          onChange={(patch) => onChange(updateBranch(value, editBranch, patch))}
        />
      ) : null}
    </>
  )
}

// ───────────────────────── 链式渲染 ─────────────────────────

interface ChainProps {
  node: FlowNode
  onAddAfter: (
    parentId: string,
    kind: 'approver' | 'notifier' | 'route',
  ) => void
  onAddInBranch: (
    branchId: string,
    kind: 'approver' | 'notifier' | 'route',
  ) => void
  onEditNode: (id: string) => void
  onEditBranch: (id: string) => void
  onDeleteNode: (id: string) => void
  onAddBranch: (routeId: string) => void
  onDeleteBranch: (routeId: string, branchId: string) => void
  condFields: Array<ConditionField>
}

function NodeChain(props: ChainProps) {
  const { node } = props
  return (
    <div className="flex flex-col items-center">
      {node.type === 'route' ? (
        <RouteNode {...props} />
      ) : (
        <NodeCard {...props} />
      )}
      {/* 「+」加节点入口（route 自身的 childNode 也走这里） */}
      <AddButton
        parentId={node.nodeId}
        onAdd={(k) => props.onAddAfter(node.nodeId, k)}
      />
      {node.childNode ? <NodeChain {...props} node={node.childNode} /> : null}
    </div>
  )
}

function NodeCard(props: ChainProps) {
  const { node, onEditNode, onDeleteNode } = props
  const color =
    node.type === 'start'
      ? 'bg-slate-500'
      : node.type === 'approver'
        ? 'bg-orange-500'
        : 'bg-sky-500'
  const title =
    node.type === 'start'
      ? '发起人'
      : node.type === 'approver'
        ? '审批人'
        : '抄送人'
  return (
    <div className="w-60 overflow-hidden rounded-lg border bg-card shadow-sm">
      <div
        className={cn(
          'flex items-center px-3 py-1.5 text-xs font-medium text-white',
          color,
        )}
      >
        <span className="flex-1">{node.name || title}</span>
        {node.type !== 'start' ? (
          <button
            type="button"
            onClick={() => onDeleteNode(node.nodeId)}
            className="opacity-80 hover:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => node.type !== 'start' && onEditNode(node.nodeId)}
        disabled={node.type === 'start'}
        className="block w-full px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent"
      >
        {node.type === 'start' ? '所有人可发起' : describeActor(node)}
      </button>
    </div>
  )
}

function describeActor(node: FlowNode): string {
  const st: SetType = node.settype ?? 'specific'
  if (st === 'specific' || st === 'selfSelect') {
    const n = node.userIds?.length ?? 0
    return n > 0 ? `${SET_TYPE_LABEL[st]}（${n} 人）` : '请选择人员'
  }
  if (st === 'role') {
    const n = node.roleIds?.length ?? 0
    return n > 0 ? `指定角色（${n} 个）` : '请选择角色'
  }
  if (st === 'leader') return `部门主管（到第 ${node.directorLevel ?? 1} 级）`
  return '发起人自己'
}

function RouteNode(props: ChainProps) {
  const {
    node,
    onEditBranch,
    onAddBranch,
    onDeleteBranch,
    onAddInBranch,
    condFields,
  } = props
  const branches = node.conditionNodes ?? []
  // 多分支才画上下两条「合流横线」；横线左右各留 7rem（w-56 的一半），正好落在首/末分支中线。
  const multi = branches.length > 1
  return (
    <div className="flex flex-col items-center">
      {/* 「添加条件」放在正常流、分支上方，不再绝对定位，避免与上一个「+」重叠 */}
      <button
        type="button"
        onClick={() => onAddBranch(node.nodeId)}
        className="whitespace-nowrap rounded-full border bg-background px-3 py-1 text-xs hover:bg-accent"
      >
        <Plus className="mr-1 inline size-3" />
        添加条件
      </button>
      <div className="h-4 w-px bg-border" />
      <div className="relative flex items-stretch gap-4">
        {multi ? (
          <>
            <div className="absolute top-0 right-28 left-28 h-px bg-border" />
            <div className="absolute bottom-0 right-28 left-28 h-px bg-border" />
          </>
        ) : null}
        {branches.map((b, i) => (
          <div
            key={b.nodeId}
            className="relative flex flex-col items-center pt-4"
          >
            {/* 顶部竖线：接上方合流横线（或单分支时接「添加条件」竖线） */}
            <div className="absolute top-0 left-1/2 h-4 w-px -translate-x-1/2 bg-border" />
            <div className="w-56 overflow-hidden rounded-lg border bg-card shadow-sm">
              <div className="flex items-center bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">
                <span className="flex-1">{b.name || `条件${i + 1}`}</span>
                <button
                  type="button"
                  onClick={() => onDeleteBranch(node.nodeId, b.nodeId)}
                  className="opacity-80 hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => onEditBranch(b.nodeId)}
                className="block w-full px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-accent"
              >
                {describeBranch(b, condFields)}
              </button>
            </div>
            <AddButton
              parentId={b.nodeId}
              onAdd={(k) => onAddInBranch(b.nodeId, k)}
            />
            {b.childNode ? <NodeChain {...props} node={b.childNode} /> : null}
            {/* 底部竖线：用 flex-1 填满到分支行底部，接下方合流横线，使长短不一的分支也对齐合流 */}
            <div className="w-px flex-1 bg-border" />
          </div>
        ))}
      </div>
    </div>
  )
}

function describeBranch(
  b: ConditionBranch,
  fields: Array<ConditionField>,
): string {
  const conds = b.conditions ?? []
  if (conds.length === 0) return '其他情况（默认分支）'
  return conds
    .map((c) => {
      const f = fields.find((x) => x.field === c.field)
      return `${f?.label ?? c.field} ${OP_LABEL[c.op]} ${String(c.value)}`
    })
    .join(' 且 ')
}

function AddButton({
  onAdd,
}: {
  parentId: string
  onAdd: (kind: 'approver' | 'notifier' | 'route') => void
}) {
  // 用 DropdownMenu（portal 渲染），避免被画布的 overflow-x-auto 容器裁剪。
  return (
    <div className="flex flex-col items-center">
      <div className="h-5 w-px bg-border" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="添加节点"
            className="flex size-6 items-center justify-center rounded-full border bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-28">
          {(
            [
              ['approver', '审批人'],
              ['notifier', '抄送人'],
              ['route', '条件分支'],
            ] as const
          ).map(([k, label]) => (
            <DropdownMenuItem key={k} onSelect={() => onAdd(k)}>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="h-5 w-px bg-border" />
    </div>
  )
}

// ───────────────────────── 配置面板（侧滑） ─────────────────────────

function Drawer({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  // 右侧抽屉（shadcn Drawer / vaul）。挂载即打开。
  // 关闭不能直接 onClose——父级会立刻卸载本组件，vaul 来不及播放滑出动画（表现为「直接隐藏」）。
  // 改为：关闭先把 open 置 false 让 vaul 播放滑出，待 onAnimationEnd(false) 动画结束再 onClose 卸载。
  const [open, setOpen] = React.useState(true)
  return (
    <DrawerRoot
      open={open}
      direction="right"
      onOpenChange={(o) => {
        if (!o) setOpen(false)
      }}
      onAnimationEnd={(o) => {
        if (!o) onClose()
      }}
    >
      <DrawerContent className="flex flex-col sm:max-w-md">
        {/* 关闭按钮放标题前面（左侧），避开右上角被胶囊遮挡 */}
        <DrawerHeader className="flex-row items-center gap-2 space-y-0 border-b">
          <DrawerClose className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </DrawerClose>
          <DrawerTitle className="text-base">{title}</DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
      </DrawerContent>
    </DrawerRoot>
  )
}

function findNode(root: FlowNode, id: string): FlowNode | null {
  if (root.nodeId === id) return root
  for (const b of root.conditionNodes ?? [])
    if (b.childNode) {
      const f = findNode(b.childNode, id)
      if (f) return f
    }
  return root.childNode ? findNode(root.childNode, id) : null
}

function findBranch(root: FlowNode, id: string): ConditionBranch | null {
  for (const b of root.conditionNodes ?? []) {
    if (b.nodeId === id) return b
    if (b.childNode) {
      const f = findBranch(b.childNode, id)
      if (f) return f
    }
  }
  return root.childNode ? findBranch(root.childNode, id) : null
}

function NodeConfigPanel({
  root,
  nodeId,
  onClose,
  onChange,
}: {
  root: FlowNode
  nodeId: string
  onClose: () => void
  onChange: (patch: Partial<FlowNode>) => void
}) {
  const node = findNode(root, nodeId)
  // useUsers 必须无条件调用（hooks 规则）；node 为空时传空数组。
  const userOf = useUsers(node?.userIds ?? [])
  if (!node) return null
  const isApprover = node.type === 'approver'
  const st: SetType = node.settype ?? 'specific'

  const pickUserIds = async () => {
    const r = await pickUsers({ value: node.userIds ?? [], multiple: true })
    if (r.status === 'picked') onChange({ userIds: r.ids })
  }

  return (
    <Drawer title={isApprover ? '审批人设置' : '抄送人设置'} onClose={onClose}>
      <div className="space-y-1.5">
        <Label>节点名称</Label>
        <Input
          value={node.name ?? ''}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{isApprover ? '审批人来源' : '抄送人来源'}</Label>
        <Select
          value={st}
          onValueChange={(v) => onChange({ settype: v as SetType })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {isApprover ? (
              <>
                <SelectItem value="specific">指定成员</SelectItem>
                <SelectItem value="leader">部门主管</SelectItem>
                <SelectItem value="initiator">发起人自己</SelectItem>
              </>
            ) : (
              <SelectItem value="specific">指定成员</SelectItem>
            )}
          </SelectContent>
        </Select>
        {isApprover && st === 'leader' ? (
          <p className="text-xs text-muted-foreground">
            连续多级主管：从直属主管起逐级审批到所设层级。
          </p>
        ) : null}
      </div>

      {st === 'specific' ? (
        <div className="space-y-2">
          <Label>选择人员</Label>
          <div className="flex flex-wrap items-center gap-2">
            {(node.userIds ?? []).map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-md bg-secondary py-1 pr-2 pl-1 text-xs"
              >
                <UserChip user={userOf(id)} />
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      userIds: (node.userIds ?? []).filter((x) => x !== id),
                    })
                  }
                  className="text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </span>
            ))}
            <Button variant="outline" size="sm" onClick={pickUserIds}>
              <Users className="size-3" /> 选择
            </Button>
          </div>
        </div>
      ) : null}

      {isApprover && st === 'leader' ? (
        <div className="space-y-1.5">
          <Label>审批到第几级主管</Label>
          <Select
            value={String(node.directorLevel ?? 1)}
            onValueChange={(v) => onChange({ directorLevel: Number(v) })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n === 1 ? '直属主管' : `第 ${n} 级主管`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {isApprover && (st === 'specific' || st === 'leader') ? (
        <div className="space-y-1.5">
          <Label>多人审批方式</Label>
          <Select
            value={node.approveMode ?? 'or'}
            onValueChange={(v) => onChange({ approveMode: v as ApproveMode })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['or', 'cosign', 'sequence'] as const).map((m) => (
                <SelectItem key={m} value={m}>
                  {APPROVE_MODE_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label>审批时限（小时，可选）</Label>
        <Input
          type="number"
          value={node.dueHours ?? ''}
          onChange={(e) =>
            onChange({
              dueHours:
                e.target.value === '' ? undefined : Number(e.target.value),
            })
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        角色来源暂以 identity 近似（当前版本未开放角色选择）。
      </p>
    </Drawer>
  )
}

function BranchConfigPanel({
  root,
  branchId,
  condFields,
  onClose,
  onChange,
}: {
  root: FlowNode
  branchId: string
  condFields: Array<ConditionField>
  onClose: () => void
  onChange: (patch: Partial<ConditionBranch>) => void
}) {
  const branch = findBranch(root, branchId)
  if (!branch) return null
  const conds = branch.conditions ?? []

  const setCond = (i: number, patch: Partial<Condition>) =>
    onChange({
      conditions: conds.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    })
  const addCond = () => {
    if (condFields.length === 0) return
    onChange({ conditions: [...conds, makeCondition(condFields[0].field)] })
  }
  const delCond = (i: number) =>
    onChange({ conditions: conds.filter((_, j) => j !== i) })

  return (
    <Drawer title="条件设置" onClose={onClose}>
      <div className="space-y-1.5">
        <Label>分支名称</Label>
        <Input
          value={branch.name ?? ''}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      {condFields.length === 0 ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          当前表单没有可用于条件的字段（需数值/金额或单选下拉字段）。该分支将作为默认分支。
        </p>
      ) : (
        <div className="space-y-2">
          <Label>条件（同时满足，AND）</Label>
          {conds.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              未设条件 = 默认（兜底）分支，永远命中。
            </p>
          ) : null}
          {conds.map((c, i) => {
            const field = condFields.find((f) => f.field === c.field)
            return (
              <div key={i} className="flex items-center gap-1.5">
                <Select
                  value={c.field}
                  onValueChange={(v) => setCond(i, { field: v })}
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {condFields.map((f) => (
                      <SelectItem key={f.field} value={f.field}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={c.op}
                  onValueChange={(v) =>
                    setCond(i, { op: v as Condition['op'] })
                  }
                >
                  <SelectTrigger className="h-8 w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(field?.numeric
                      ? (['gt', 'gte', 'lt', 'lte', 'eq', 'ne'] as const)
                      : (['eq', 'ne'] as const)
                    ).map((op) => (
                      <SelectItem key={op} value={op}>
                        {OP_LABEL[op]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {field?.options && field.options.length > 0 ? (
                  <Select
                    value={
                      c.value === undefined ||
                      c.value === null ||
                      c.value === ''
                        ? COND_VALUE_NONE
                        : String(c.value)
                    }
                    onValueChange={(v) => {
                      if (v === COND_VALUE_NONE) {
                        setCond(i, { value: '' })
                        return
                      }
                      const opt = field.options!.find(
                        (o) => String(o.value) === v,
                      )
                      setCond(i, { value: opt ? opt.value : v })
                    }}
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={COND_VALUE_NONE}>请选择</SelectItem>
                      {field.options.map((o) => (
                        <SelectItem key={String(o.value)} value={String(o.value)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="h-8"
                    type={field?.numeric ? 'number' : 'text'}
                    value={
                      c.value === undefined || c.value === null
                        ? ''
                        : String(c.value)
                    }
                    onChange={(e) =>
                      setCond(i, {
                        value: field?.numeric
                          ? e.target.value === ''
                            ? ''
                            : Number(e.target.value)
                          : e.target.value,
                      })
                    }
                  />
                )}
                <button
                  type="button"
                  onClick={() => delCond(i)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            )
          })}
          <Button variant="outline" size="sm" onClick={addCond}>
            <Plus className="size-3" /> 增加条件
          </Button>
        </div>
      )}
    </Drawer>
  )
}
