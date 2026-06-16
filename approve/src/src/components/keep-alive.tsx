import { useEffect, useLayoutEffect, useRef } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { InstListView } from '#/components/views/inst-list'
import type { Box } from '#/components/views/inst-list'
import { cn } from '#/lib/utils'
import { useT } from '#/lib/i18n/context'
import type { MsgKey } from '#/lib/i18n/messages'

// 四个列表视图常驻挂载，按当前路径显隐切换（类似 Vue keep-alive，切视图不丢状态）。
// 落地页（/）、详情（/insts/$id）、发起（/start/$defId）、统计、管理走 __root 的 Outlet。
const VIEWS: Array<{ path: string; box: Box }> = [
  { path: '/todo', box: 'todo' },
  { path: '/done', box: 'done' },
  { path: '/cc', box: 'cc' },
  { path: '/mine', box: 'mine' },
]

// 「我收到的」三页签（移动端在内容顶部以分段控件切换；桌面端由左侧边栏切换，故隐藏）。
const INBOX_TABS: Array<{ path: string; labelKey: MsgKey }> = [
  { path: '/todo', labelKey: 'nav.todo' },
  { path: '/done', labelKey: 'nav.done' },
  { path: '/cc', labelKey: 'nav.cc' },
]

// basepath 为 /apps/approve，统一归一化成应用内相对路径。
function normalize(pathname: string): string {
  const p = pathname.replace(/^\/apps\/approve/, '')
  return p === '' ? '/' : p
}

export function KeepAliveViews() {
  const t = useT()
  const raw = useRouterState({ select: (s) => s.location.pathname })
  const pathname = normalize(raw)
  const scrollMap = useRef<Record<string, number>>({})
  const prev = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (prev.current && prev.current !== pathname) {
      scrollMap.current[prev.current] = window.scrollY
    }
    if (VIEWS.some((v) => v.path === pathname)) {
      const y = scrollMap.current[pathname] ?? 0
      requestAnimationFrame(() => window.scrollTo(0, y))
    }
    prev.current = pathname
  }, [pathname])

  const inInbox = INBOX_TABS.some((t) => t.path === pathname)
  const anyActive = VIEWS.some((v) => v.path === pathname)

  return (
    <div hidden={!anyActive}>
      {inInbox ? (
        <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1 md:hidden">
          {INBOX_TABS.map((tab) => (
            <Link
              key={tab.path}
              to={tab.path}
              className={cn(
                'flex-1 rounded-md py-1.5 text-center text-sm font-medium transition',
                pathname === tab.path
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground',
              )}
            >
              {t(tab.labelKey)}
            </Link>
          ))}
        </div>
      ) : null}
      {VIEWS.map(({ path, box }) => {
        const active = pathname === path
        return (
          <div key={path} hidden={!active}>
            <InstListView box={box} active={active} />
          </div>
        )
      })}
    </div>
  )
}

/**
 * 当视图从「非激活」变为「激活」时执行 fn（用于切回页面时后台刷新）。
 * 首次挂载不触发（交给组件自身的初始加载）。
 */
export function useActivate(active: boolean, fn: () => void) {
  const wasActive = useRef(active)
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    if (active && !wasActive.current) fnRef.current()
    wasActive.current = active
  }, [active])
}
