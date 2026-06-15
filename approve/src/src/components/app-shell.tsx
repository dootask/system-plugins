import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock,
  FilePlus2,
  Forward,
  SendHorizontal,
  SlidersHorizontal,
} from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import { cn } from '#/lib/utils'
import { useDooTask } from '#/lib/dootask'
import { api } from '#/lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'

type Icon = ComponentType<LucideProps>

interface NavItem {
  to: string
  label: string
  icon: Icon
  exact?: boolean
  adminOnly?: boolean
  /** 移动端底部 Tab 高亮命中的额外路径（如「我审批的」覆盖待处理/已处理/抄送）。 */
  match?: Array<string>
}

interface NavGroup {
  label?: string
  items: Array<NavItem>
}

// 桌面端左侧导航（按组）。
const SIDEBAR_GROUPS: Array<NavGroup> = [
  { items: [{ to: '/', label: '发起申请', icon: FilePlus2, exact: true }] },
  {
    label: '我收到的',
    items: [
      { to: '/todo', label: '待处理', icon: Clock },
      { to: '/done', label: '已处理', icon: CheckCircle2 },
      { to: '/cc', label: '抄送我的', icon: Forward },
    ],
  },
  {
    label: '我提交的',
    items: [{ to: '/mine', label: '已提交', icon: SendHorizontal }],
  },
  {
    label: '管理',
    items: [
      { to: '/stats', label: '数据统计', icon: BarChart3, adminOnly: true },
      { to: '/admin', label: '审批管理', icon: SlidersHorizontal, adminOnly: true },
    ],
  },
]

// 移动端底部 Tab。
const BOTTOM_TABS: Array<NavItem> = [
  { to: '/', label: '发起申请', icon: FilePlus2, exact: true },
  { to: '/todo', label: '我审批的', icon: CheckCircle2, match: ['/todo', '/done', '/cc'] },
  { to: '/mine', label: '已提交', icon: SendHorizontal },
  { to: '/stats', label: '数据统计', icon: BarChart3, adminOnly: true },
  { to: '/admin', label: '管理', icon: SlidersHorizontal, adminOnly: true },
]

// 顶层路由（侧边栏/底部 Tab 可直达）：在这些页点返回 = 退出微应用回 DooTask；
// 其余子页（详情 / 发起 / 模板编辑）点返回 = 应用内后退。
const ROOT_PATHS = ['/', '/todo', '/done', '/cc', '/mine', '/stats', '/admin']

function normalize(pathname: string): string {
  const p = pathname.replace(/^\/apps\/approve/, '')
  return p === '' ? '/' : p
}

function titleOf(pathname: string): string {
  if (pathname.startsWith('/insts/')) return '审批详情'
  if (pathname.startsWith('/start/')) return '发起申请'
  if (pathname.startsWith('/admin/defs/')) return '模板编辑'
  return '审批中心'
}

function useIsAdmin(ready: boolean): boolean {
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    if (!ready) return
    api<{ isAdmin?: boolean }>('/me')
      .then((me) => setIsAdmin(!!me.isAdmin))
      .catch(() => setIsAdmin(false))
  }, [ready])
  return isAdmin
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, status } = useDooTask()
  const isAdmin = useIsAdmin(status === 'ready')
  const raw = useRouterState({ select: (s) => s.location.pathname })
  const pathname = normalize(raw)
  const navigate = useNavigate()
  const search = useRouterState({ select: (s) => s.location.search })
  const nickname = user?.nickname || (user ? `用户#${user.userid}` : '')
  const avatar = (user?.userimg as string | undefined) || undefined

  // 取主程序安全距离（移动端刘海/底部 home 条）；并隐藏右上角胶囊，改用自带返回控件。
  const [safe, setSafe] = useState<{ top: number; bottom: number }>({
    top: 0,
    bottom: 0,
  })
  useEffect(() => {
    if (status !== 'ready') return
    let cancelled = false
    import('@dootask/tools')
      .then(async (t) => {
        // 显示主程序胶囊（提供关闭/返回）；仅取安全距离给移动标题栏/底部 Tab 留位。
        const s = await t.getSafeArea()
        // 运行时若 host 未提供 safeArea，访问 s.top 会抛错，落到下方 catch 保持默认 0。
        if (!cancelled) setSafe({ top: s.top, bottom: s.bottom })
      })
      .catch(() => {
        /* 非微前端环境无 host，忽略 */
      })
    return () => {
      cancelled = true
    }
  }, [status])

  const shellVars = {
    '--sat': `${safe.top}px`,
    '--sab': `${safe.bottom}px`,
  } as React.CSSProperties

  // 返回：子页应用内后退；顶层页退出微应用回 DooTask。
  async function handleBack() {
    if (!ROOT_PATHS.includes(pathname)) {
      // 子页：优先回到来源列表（from），否则浏览器后退。
      if (search.from) navigate({ to: search.from as '/' })
      else window.history.back()
      return
    }
    try {
      const t = await import('@dootask/tools')
      await t.closeApp()
    } catch {
      /* 独立环境无 host，忽略 */
    }
  }

  return (
    <div className="flex min-h-screen bg-muted/30" style={shellVars}>
      {/* 桌面端左侧边栏 */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-background md:flex">
        <div className="flex h-14 items-center gap-1 border-b px-3">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={handleBack}
            aria-label="返回"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <span className="text-base font-semibold">审批中心</span>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {SIDEBAR_GROUPS.map((group, gi) => {
            const items = group.items.filter((it) => !it.adminOnly || isAdmin)
            if (items.length === 0) return null
            return (
              <div key={gi} className="space-y-1">
                {group.label ? (
                  <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">
                    {group.label}
                  </p>
                ) : null}
                {items.map((it) => (
                  <Link
                    key={it.to}
                    to={it.to}
                    activeOptions={{ exact: it.exact }}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    activeProps={{
                      className: cn('!bg-primary/10 !text-primary'),
                    }}
                  >
                    <it.icon className="size-4" />
                    {it.label}
                  </Link>
                ))}
              </div>
            )
          })}
        </nav>
        {nickname ? (
          <div className="flex items-center gap-2 border-t px-4 py-3">
            <Avatar className="size-7">
              {avatar ? <AvatarImage src={avatar} alt={nickname} /> : null}
              <AvatarFallback className="text-xs">
                {nickname.slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm text-muted-foreground">
              {nickname}
            </span>
          </div>
        ) : null}
      </aside>

      {/* 主内容区 */}
      <main className="min-w-0 flex-1 pb-[calc(4rem+var(--sab,0px))] md:pb-0">
        {/* 移动端顶部标题栏（带返回）；替代被隐藏的胶囊。h-14 与桌面端表头同高。 */}
        <div className="sticky top-0 z-30 border-b bg-background/95 pt-[var(--sat,0px)] backdrop-blur md:hidden">
          <div className="flex h-14 items-center gap-1 px-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              aria-label="返回"
            >
              <ArrowLeft className="size-5" />
            </Button>
            <span className="text-base font-semibold">
              {titleOf(pathname)}
            </span>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-6 pt-5 max-sm:px-3">
          {children}
        </div>
      </main>

      {/* 移动端底部 Tab */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[var(--sab,0px)] md:hidden">
        {BOTTOM_TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => {
          const active = t.match
            ? t.match.includes(pathname)
            : t.exact
              ? pathname === t.to
              : pathname.startsWith(t.to)
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <t.icon className="size-5" />
              {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
