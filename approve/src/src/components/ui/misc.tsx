import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '#/lib/utils'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Skeleton } from '#/components/ui/skeleton'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'

// 子页面包屑里「来源」（顶层路由）的显示名。
const CRUMB_LABEL: Record<string, string> = {
  '/': '发起申请',
  '/todo': '待处理',
  '/done': '已处理',
  '/cc': '抄送我的',
  '/mine': '已提交',
  '/stats': '数据统计',
  '/admin': '模板管理',
  '/admin/backup': '数据备份',
}

/** 三级子页（详情 / 发起 / 模板编辑）统一面包屑：来源列表（可点返回）> 当前页。 */
export function SubPageBreadcrumb({
  parent,
  current,
}: {
  parent?: string
  current: ReactNode
}) {
  const to = parent && CRUMB_LABEL[parent] ? parent : '/'
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to={to}>{CRUMB_LABEL[to]}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

// 骨架屏占位（替代旋转图标，贴近 shadcn 风格）。center 仅保留签名兼容旧调用。
export function Loading({ center }: { center?: boolean }) {
  return (
    <div
      className={cn('space-y-3', center && 'py-2')}
      aria-busy="true"
      aria-label="加载中"
    >
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed py-12 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function ErrorBar({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

// ───────────────────────── 状态标签 ─────────────────────────

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: '草稿', cls: 'bg-muted text-muted-foreground' },
  running: {
    label: '审批中',
    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  },
  approved: {
    label: '已通过',
    cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  },
  rejected: {
    label: '已拒绝',
    cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  },
  withdrawn: { label: '已撤回', cls: 'bg-muted text-muted-foreground' },
  archived: {
    label: '已归档',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
}

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    cls: 'bg-muted text-muted-foreground',
  }
  return (
    <Badge className={cn('rounded-full border-transparent', meta.cls)}>
      {meta.label}
    </Badge>
  )
}

/** 把 ISO/SQLite 时间字符串格式化为本地可读时间。 */
export function formatTime(s: string | null | undefined): string {
  if (!s) return '—'
  // SQLite datetime('now') 是 UTC 的 'YYYY-MM-DD HH:MM:SS'，补 Z 让 Date 按 UTC 解析。
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return s
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
