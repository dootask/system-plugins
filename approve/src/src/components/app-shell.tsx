import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  BarChart3,
  CheckCircle2,
  Clock,
  DatabaseBackup,
  FilePlus2,
  Forward,
  SendHorizontal,
  SlidersHorizontal,
} from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import { cn } from '#/lib/utils'
import { useDooTask } from '#/lib/dootask'
import { api } from '#/lib/api'
import { useT } from '#/lib/i18n/context'
import type { MsgKey } from '#/lib/i18n/messages'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'

type Icon = ComponentType<LucideProps>

interface NavItem {
  to: string
  labelKey: MsgKey
  icon: Icon
  exact?: boolean
  adminOnly?: boolean
  /** 移动端底部 Tab 高亮命中的额外路径（如「我审批的」覆盖待处理/已处理/抄送）。 */
  match?: Array<string>
}

interface NavGroup {
  labelKey?: MsgKey
  items: Array<NavItem>
}

// 桌面端左侧导航（按组）。
const SIDEBAR_GROUPS: Array<NavGroup> = [
  { items: [{ to: '/', labelKey: 'nav.start', icon: FilePlus2, exact: true }] },
  {
    labelKey: 'nav.group.received',
    items: [
      { to: '/todo', labelKey: 'nav.todo', icon: Clock },
      { to: '/done', labelKey: 'nav.done', icon: CheckCircle2 },
      { to: '/cc', labelKey: 'nav.cc', icon: Forward },
    ],
  },
  {
    labelKey: 'nav.group.submitted',
    items: [{ to: '/mine', labelKey: 'nav.mine', icon: SendHorizontal }],
  },
  {
    labelKey: 'nav.group.manage',
    items: [
      { to: '/stats', labelKey: 'nav.stats', icon: BarChart3, adminOnly: true },
      {
        to: '/admin',
        labelKey: 'nav.templates',
        icon: SlidersHorizontal,
        adminOnly: true,
        exact: true,
      },
      {
        to: '/admin/backup',
        labelKey: 'nav.backup',
        icon: DatabaseBackup,
        adminOnly: true,
      },
    ],
  },
]

// 移动端底部 Tab。
const BOTTOM_TABS: Array<NavItem> = [
  { to: '/', labelKey: 'nav.start', icon: FilePlus2, exact: true },
  {
    to: '/todo',
    labelKey: 'nav.tab.myApprovals',
    icon: CheckCircle2,
    match: ['/todo', '/done', '/cc'],
  },
  { to: '/mine', labelKey: 'nav.mine', icon: SendHorizontal },
  {
    to: '/admin',
    labelKey: 'nav.tab.manage',
    icon: SlidersHorizontal,
    adminOnly: true,
    // 移动端「管理」合并数据统计 / 模板管理 / 数据备份，内部用分段控件切换（见 AdminTabs）。
    match: ['/admin', '/admin/backup', '/stats'],
  },
]

// 顶层路由（侧边栏/底部 Tab 可直达）：在这些页点返回 = 退出微应用回 DooTask；
// 其余子页（详情 / 发起 / 模板编辑）点返回 = 应用内后退。
const ROOT_PATHS = ['/', '/todo', '/done', '/cc', '/mine', '/stats', '/admin']

function normalize(pathname: string): string {
  const p = pathname.replace(/^\/apps\/approve/, '')
  return p === '' ? '/' : p
}

// 子页（发起表单 / 详情 / 模板编辑）归属到哪个顶层导航高亮：
// - /start/*    → 发起申请（/）
// - /admin/defs/* → 审批管理（/admin）
// - /insts/*    → 来源列表（from，仅当为已知顶层路径），否则不高亮
function effectivePath(pathname: string, from?: string): string {
  if (pathname.startsWith('/start/')) return '/'
  if (pathname.startsWith('/admin/defs/')) return '/admin'
  if (pathname.startsWith('/insts/'))
    return from && ROOT_PATHS.includes(from) ? from : pathname
  return pathname
}

// 顶层路由的移动端标题栏文案。桌面端各页自身 h1 显示标题、移动端 h1 隐藏（max-md:hidden），
// 统一由顶部标题栏据当前路径显示，避免移动端各页都只显示「审批中心」。
const PAGE_TITLE: Record<string, MsgKey> = {
  '/': 'nav.start',
  '/todo': 'nav.todo',
  '/done': 'nav.done',
  '/cc': 'nav.cc',
  '/mine': 'nav.mine',
  '/stats': 'nav.stats',
  '/admin': 'nav.templates',
  '/admin/backup': 'nav.backup',
}

function titleKeyOf(pathname: string): MsgKey {
  if (pathname.startsWith('/insts/')) return 'page.title.detail'
  if (pathname.startsWith('/start/')) return 'nav.start'
  if (pathname.startsWith('/admin/defs/')) return 'page.title.templateEdit'
  return PAGE_TITLE[pathname] ?? 'app.title'
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
  const t = useT()
  const { user, status } = useDooTask()
  const isAdmin = useIsAdmin(status === 'ready')
  const raw = useRouterState({ select: (s) => s.location.pathname })
  const pathname = normalize(raw)
  const search = useRouterState({ select: (s) => s.location.search })
  const from = typeof search.from === 'string' ? search.from : undefined
  // 子页高亮归属的顶层路径（侧边栏 / 底部 Tab 据此判定激活）。
  const eff = effectivePath(pathname, from)
  const nickname =
    user?.nickname ||
    (user ? t('app.userFallback', { id: user.userid }) : '')
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

  // 各列表数量（侧边栏角标）。随握手就绪与路由变化刷新，保持大致实时。
  const [counts, setCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    if (status !== 'ready') return
    let cancelled = false
    api<{ todo: number; done: number; cc: number; mine: number }>('/counts')
      .then((c) => {
        if (!cancelled)
          setCounts({
            '/todo': c.todo,
            '/done': c.done,
            '/cc': c.cc,
            '/mine': c.mine,
          })
      })
      .catch(() => {
        /* 角标拉取失败忽略 */
      })
    return () => {
      cancelled = true
    }
  }, [status, pathname])

  const shellVars = {
    '--sat': `${safe.top}px`,
    '--sab': `${safe.bottom}px`,
  } as React.CSSProperties

  return (
    <div className="flex min-h-screen bg-muted/30" style={shellVars}>
      {/* 桌面端左侧边栏 */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-background md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <span className="text-base font-semibold">{t('app.title')}</span>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {SIDEBAR_GROUPS.map((group, gi) => {
            const items = group.items.filter((it) => !it.adminOnly || isAdmin)
            if (items.length === 0) return null
            return (
              <div key={gi} className="space-y-1">
                {group.labelKey ? (
                  <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">
                    {t(group.labelKey)}
                  </p>
                ) : null}
                {items.map((it) => {
                  const active = it.exact
                    ? eff === it.to
                    : eff.startsWith(it.to)
                  return (
                    <Link
                      key={it.to}
                      to={it.to}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition',
                        active
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      <it.icon className="size-4 shrink-0" />
                      <span className="flex-1 truncate">{t(it.labelKey)}</span>
                      {counts[it.to] ? (
                        <Badge
                          variant="secondary"
                          className="h-5 min-w-5 justify-center rounded-full px-1.5 text-xs tabular-nums"
                        >
                          {counts[it.to]}
                        </Badge>
                      ) : null}
                    </Link>
                  )
                })}
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
        {/* 移动端顶部标题栏（仅标题；返回交由各子页自身的返回控件 / 胶囊）。h-14 与桌面端表头同高。 */}
        <div className="sticky top-0 z-30 border-b bg-background/95 pt-[var(--sat,0px)] backdrop-blur md:hidden">
          <div className="flex h-13 items-center px-4">
            <span className="text-base font-semibold">
              {t(titleKeyOf(pathname))}
            </span>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-6 pt-5 max-sm:px-3">
          {children}
        </div>
      </main>

      {/* 移动端底部 Tab */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[var(--sab,0px)] md:hidden">
        {BOTTOM_TABS.filter((tab) => !tab.adminOnly || isAdmin).map((tab) => {
          const active = tab.match
            ? tab.match.includes(eff)
            : tab.exact
              ? eff === tab.to
              : eff.startsWith(tab.to)
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <tab.icon className="size-5" />
              {t(tab.labelKey)}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
