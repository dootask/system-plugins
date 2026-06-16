import { Link, useRouterState } from '@tanstack/react-router'
import { cn } from '#/lib/utils'

// 「管理」三页签：移动端在内容顶部以分段控件切换（同「我审批的」）；桌面端由左侧边栏切换，故隐藏。
const ADMIN_TABS: Array<{ path: string; label: string }> = [
  { path: '/stats', label: '数据统计' },
  { path: '/admin', label: '模板管理' },
  { path: '/admin/backup', label: '数据备份' },
]

function normalize(pathname: string): string {
  const p = pathname.replace(/^\/apps\/approve/, '')
  return p === '' ? '/' : p
}

export function AdminTabs() {
  const raw = useRouterState({ select: (s) => s.location.pathname })
  const pathname = normalize(raw)
  return (
    <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1 md:hidden">
      {ADMIN_TABS.map((t) => (
        <Link
          key={t.path}
          to={t.path}
          className={cn(
            'flex-1 rounded-md py-1.5 text-center text-sm font-medium transition',
            pathname === t.path
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground',
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
