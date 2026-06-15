import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Plus, Search } from 'lucide-react'
import { api, ApiError } from '#/lib/api'
import { confirmAction, useDooTask } from '#/lib/dootask'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { ListPager } from '#/components/ui/list-pager'
import { EmptyState, ErrorBar, Loading, formatTime } from '#/components/ui/misc'

interface DefRow {
  id: number
  name: string
  category: string
  icon: string | null
  version: number
  status: string
  sort_order: number
  updated_at: string
}

const STATUS_ALL = '__all__'

export function TemplateList() {
  const navigate = useNavigate()
  const { status: dtStatus } = useDooTask()
  const [rows, setRows] = useState<Array<DefRow>>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [keyword, setKeyword] = useState('')
  const [debKeyword, setDebKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    const t = setTimeout(() => setDebKeyword(keyword), 300)
    return () => clearTimeout(t)
  }, [keyword])
  useEffect(() => setPage(1), [debKeyword, statusFilter, pageSize])

  const load = () => {
    const qs = new URLSearchParams({
      all: '1',
      page: String(page),
      pageSize: String(pageSize),
    })
    if (debKeyword) qs.set('keyword', debKeyword)
    if (statusFilter) qs.set('status', statusFilter)
    api<{ items: Array<DefRow>; total: number }>(`/defs?${qs.toString()}`)
      .then((res) => {
        setRows(res.items)
        setTotal(res.total)
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    if (dtStatus === 'ready') load()
    else if (dtStatus !== 'loading') setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dtStatus, page, pageSize, debKeyword, statusFilter])

  const toggle = async (d: DefRow) => {
    const next = d.status === 'enabled' ? 'disabled' : 'enabled'
    try {
      await api(`/defs/${d.id}`, { method: 'PUT', json: { status: next } })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '操作失败')
    }
  }
  const del = async (d: DefRow) => {
    if (
      !(await confirmAction(
        `确认删除模板「${d.name}」？已发起的审批单不受影响。`,
      ))
    )
      return
    try {
      await api(`/defs/${d.id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '删除失败')
    }
  }

  return (
    <div>
      {/* 桌面端标题独占一行，让右上角留给胶囊 */}
      <h1 className="mb-4 text-lg font-semibold max-md:hidden">模板管理</h1>

      {/* 搜索 + 筛选 + 新建 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索模板名称"
            className="pl-8"
          />
        </div>
        <Select
          value={statusFilter || STATUS_ALL}
          onValueChange={(v) => setStatusFilter(v === STATUS_ALL ? '' : v)}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_ALL}>全部</SelectItem>
            <SelectItem value="enabled">启用</SelectItem>
            <SelectItem value="disabled">停用</SelectItem>
          </SelectContent>
        </Select>
        <Button
          className="ml-auto"
          onClick={() =>
            navigate({ to: '/admin/defs/$id', params: { id: 'new' } })
          }
        >
          <Plus className="size-4" /> 新建模板
        </Button>
      </div>

      {error ? <ErrorBar message={error} /> : null}

      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="暂无模板" hint="点击「新建模板」开始配置" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>模板</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="max-sm:hidden">版本</TableHead>
                <TableHead className="max-sm:hidden">更新时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">
                      <span className="text-lg leading-none">
                        {d.icon || '📄'}
                      </span>
                      {d.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={d.status === 'enabled' ? 'default' : 'secondary'}
                    >
                      {d.status === 'enabled' ? '启用' : '停用'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-sm:hidden">
                    v{d.version}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-sm:hidden">
                    {formatTime(d.updated_at)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigate({
                          to: '/admin/defs/$id',
                          params: { id: String(d.id) },
                        })
                      }
                    >
                      编辑
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggle(d)}>
                      {d.status === 'enabled' ? '停用' : '启用'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => del(d)}
                    >
                      删除
                    </Button>
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
