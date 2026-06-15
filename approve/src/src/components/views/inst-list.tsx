import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ListFilter, Search } from 'lucide-react'
import { api, ApiError } from '#/lib/api'
import { cn } from '#/lib/utils'
import { useActivate } from '#/components/keep-alive'
import { useUsers } from '#/lib/use-users'
import { UserChip } from '#/components/ui/user-chip'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { ListPager } from '#/components/ui/list-pager'
import {
  EmptyState,
  ErrorBar,
  Loading,
  StatusBadge,
  formatTime,
} from '#/components/ui/misc'
import type { DefSummary, InstSummary } from '#/lib/types'

export type Box = 'todo' | 'done' | 'mine' | 'cc'

const TITLE: Record<Box, string> = {
  todo: '待处理',
  done: '已处理',
  mine: '已提交',
  cc: '抄送我的',
}
const EMPTY_HINT: Record<Box, string> = {
  todo: '当前没有需要你审批的单据',
  done: '你还没有处理过任何审批单',
  mine: '在「发起申请」中选择模板开始一个新流程',
  cc: '暂时没有抄送给你的单据',
}

const STATUS_ALL = '__all__'
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'running', label: '审批中' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'withdrawn', label: '已撤回' },
  { value: 'archived', label: '已归档' },
]

// 模板名映射跨视图共享一次拉取即可（列表项只回 def_id）。
let defNameCache: Record<number, string> | null = null

interface ListResp {
  items: Array<InstSummary>
  total: number
}

export function InstListView({ box, active }: { box: Box; active: boolean }) {
  const navigate = useNavigate()
  const [items, setItems] = useState<Array<InstSummary>>([])
  const [total, setTotal] = useState(0)
  const [defNames, setDefNames] = useState<Record<number, string>>(
    defNameCache ?? {},
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [keyword, setKeyword] = useState('')
  const [debKeyword, setDebKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const loadedOnce = useRef(false)

  // 搜索词防抖。
  useEffect(() => {
    const t = setTimeout(() => setDebKeyword(keyword), 300)
    return () => clearTimeout(t)
  }, [keyword])
  // 过滤条件变化回到第一页。
  useEffect(() => setPage(1), [debKeyword, status, pageSize])

  async function load() {
    setError(null)
    try {
      const qs = new URLSearchParams({
        box,
        page: String(page),
        pageSize: String(pageSize),
      })
      if (debKeyword) qs.set('keyword', debKeyword)
      if (status) qs.set('status', status)
      const res = await api<ListResp>(`/insts?${qs.toString()}`)
      setItems(res.items)
      setTotal(res.total)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  // 拉取模板名（一次性，跨视图缓存）。
  useEffect(() => {
    if (defNameCache) return
    api<Array<DefSummary>>('/defs')
      .then((defs) => {
        const map: Record<number, string> = {}
        for (const d of defs) map[d.id] = d.name
        defNameCache = map
        setDefNames(map)
      })
      .catch(() => {
        /* 模板名解析失败时退化为「模板#id」 */
      })
  }, [])

  // 激活时按当前分页/过滤加载；切回本视图后台刷新。
  useEffect(() => {
    if (!active) return
    loadedOnce.current = true
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, page, pageSize, debKeyword, status])
  useActivate(active, () => {
    if (loadedOnce.current) load()
  })

  const userOf = useUsers(items.map((r) => r.initiator_id))

  return (
    <div>
      {/* 桌面端标题独占一行（移动端顶部标题栏已显示），让右上角留给胶囊 */}
      <h1 className="mb-4 text-lg font-semibold max-md:hidden">{TITLE[box]}</h1>

      {/* 搜索 + 筛选（移动端用筛选图标弹出状态，桌面端保留下拉） */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索标题"
              className="pl-8"
            />
          </div>
          {/* 移动端状态筛选 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="按状态筛选"
                className={cn(
                  'relative shrink-0 sm:hidden',
                  status && 'border-primary text-primary',
                )}
              >
                <ListFilter className="size-4" />
                {status ? (
                  <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={status || STATUS_ALL}
                onValueChange={(v) => setStatus(v === STATUS_ALL ? '' : v)}
              >
                <DropdownMenuRadioItem value={STATUS_ALL}>
                  全部状态
                </DropdownMenuRadioItem>
                {STATUS_OPTIONS.map((o) => (
                  <DropdownMenuRadioItem key={o.value} value={o.value}>
                    {o.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* 桌面端状态下拉 */}
        <Select
          value={status || STATUS_ALL}
          onValueChange={(v) => setStatus(v === STATUS_ALL ? '' : v)}
        >
          <SelectTrigger className="w-32 max-sm:hidden">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_ALL}>全部状态</SelectItem>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? <ErrorBar message={error} /> : null}

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState title="暂无审批单" hint={EMPTY_HINT[box]} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead>模板</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>发起人</TableHead>
                <TableHead className="text-right">提交时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() =>
                    navigate({
                      to: '/insts/$id',
                      params: { id: String(r.id) },
                      search: { from: `/${box}` },
                    })
                  }
                >
                  <TableCell className="font-medium">{r.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {defNames[r.def_id] ?? `模板#${r.def_id}`}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell>
                    <UserChip user={userOf(r.initiator_id)} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatTime(r.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListPager
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      )}
    </div>
  )
}
