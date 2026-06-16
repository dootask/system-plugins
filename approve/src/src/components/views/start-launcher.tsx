import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ListFilter, Search } from 'lucide-react'
import { api, ApiError } from '#/lib/api'
import { CATEGORY_GROUPS, groupOf } from '#/lib/categories'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { EmptyState, ErrorBar, Loading } from '#/components/ui/misc'
import { cn } from '#/lib/utils'
import { useT } from '#/lib/i18n/context'
import type { DefSummary } from '#/lib/types'

const ALL = '__all__'

export function StartLauncher() {
  const t = useT()
  const navigate = useNavigate()
  const [defs, setDefs] = useState<Array<DefSummary>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [tab, setTab] = useState<string>(ALL)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    api<Array<DefSummary>>('/defs')
      .then(setDefs)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : t('start.loadFailed')),
      )
      .finally(() => setLoading(false))
    api<{ isAdmin?: boolean }>('/me')
      .then((me) => setIsAdmin(!!me.isAdmin))
      .catch(() => setIsAdmin(false))
  }, [])

  // 仅展示有模板的分组（保持顺序）。
  const groupsWithDefs = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    const matched = kw
      ? defs.filter((d) => d.name.toLowerCase().includes(kw))
      : defs
    return CATEGORY_GROUPS.map((g) => ({
      ...g,
      items: matched.filter((d) => groupOf(d.category) === g.code),
    })).filter((g) => g.items.length > 0)
  }, [defs, keyword])

  const visibleGroups =
    tab === ALL ? groupsWithDefs : groupsWithDefs.filter((g) => g.code === tab)

  if (loading) return <Loading center />

  return (
    <div>
      {/* 桌面端标题（移动端顶部标题栏已显示）；标题独占一行，让右上角留给胶囊 */}
      <h1 className="mb-4 text-lg font-semibold max-md:hidden">
        {t('nav.start')}
      </h1>
      {/* 顶部：分类页签（桌面）+ 搜索；移动端搜索框右侧用筛选图标弹出分类 */}
      <div className="mb-5 flex items-center gap-3 max-sm:flex-col max-sm:items-stretch">
        <div className="flex flex-1 flex-wrap gap-1 max-sm:hidden">
          <TabPill active={tab === ALL} onClick={() => setTab(ALL)}>
            {t('common.all')}
          </TabPill>
          {groupsWithDefs.map((g) => (
            <TabPill
              key={g.code}
              active={tab === g.code}
              onClick={() => setTab(g.code)}
            >
              {t(g.labelKey)}
            </TabPill>
          ))}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-64">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t('start.searchPlaceholder')}
              className="pl-8"
            />
          </div>
          {/* 移动端分类筛选（桌面端有页签，故隐藏）；选中具体分类时图标高亮+圆点 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={t('start.filterByCategory')}
                className={cn(
                  'relative shrink-0 sm:hidden',
                  tab !== ALL && 'border-primary text-primary',
                )}
              >
                <ListFilter className="size-4" />
                {tab !== ALL ? (
                  <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={tab} onValueChange={setTab}>
                <DropdownMenuRadioItem value={ALL}>
                  {t('common.all')}
                </DropdownMenuRadioItem>
                {groupsWithDefs.map((g) => (
                  <DropdownMenuRadioItem key={g.code} value={g.code}>
                    {t(g.labelKey)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error ? <ErrorBar message={error} /> : null}

      {visibleGroups.length === 0 ? (
        <EmptyState
          title={t('start.empty')}
          hint={
            isAdmin ? t('start.emptyHintAdmin') : t('start.emptyHintUser')
          }
        />
      ) : (
        <div className="space-y-7">
          {visibleGroups.map((g) => (
            <section key={g.code}>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                {t(g.labelKey)}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {g.items.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() =>
                      navigate({
                        to: '/start/$defId',
                        params: { defId: String(d.id) },
                        search: { from: '/' },
                      })
                    }
                    className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3.5 text-left shadow-sm transition hover:border-primary/40 hover:shadow"
                  >
                    <span className="text-2xl leading-none">
                      {d.icon || '📄'}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {d.name}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {isAdmin ? (
        <p className="mt-8 text-center text-xs text-muted-foreground">
          {t('start.createHintPrefix')}
          <Link
            to="/admin/defs/$id"
            params={{ id: 'new' }}
            className="ml-1 text-primary hover:underline"
          >
            {t('start.createTemplate')}
          </Link>
        </p>
      ) : null}
    </div>
  )
}

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
