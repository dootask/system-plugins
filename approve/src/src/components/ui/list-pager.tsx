import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from '#/components/ui/pagination'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { useT } from '#/lib/i18n/context'

const PAGE_SIZES = [10, 20, 50]

/** 计算页码窗口（含省略号）。 */
function pageWindow(page: number, total: number): Array<number | 'gap'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: Array<number | 'gap'> = [1]
  const lo = Math.max(2, page - 1)
  const hi = Math.min(total - 1, page + 1)
  if (lo > 2) out.push('gap')
  for (let p = lo; p <= hi; p++) out.push(p)
  if (hi < total - 1) out.push('gap')
  out.push(total)
  return out
}

/**
 * 列表底部：左侧总数量；右侧每页数量 + 分页。总页数 ≤ 1 时隐藏右侧。
 */
export function ListPager({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  total: number
  page: number
  pageSize: number
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
}) {
  const t = useT()
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">
        {t('ui.pager.total', { n: total })}
      </span>
      {totalPages > 1 ? (
        <div className="flex items-center gap-3">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="h-9 w-[104px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {t('ui.pager.perPage', { n: s })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationLink
                  href="#"
                  aria-label={t('ui.pager.prev')}
                  aria-disabled={page <= 1}
                  className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
                  onClick={(e) => {
                    e.preventDefault()
                    if (page > 1) onPageChange(page - 1)
                  }}
                >
                  <ChevronLeftIcon />
                </PaginationLink>
              </PaginationItem>
              {pageWindow(page, totalPages).map((p, i) =>
                p === 'gap' ? (
                  <PaginationItem key={`gap-${i}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={p}>
                    <PaginationLink
                      href="#"
                      isActive={p === page}
                      onClick={(e) => {
                        e.preventDefault()
                        onPageChange(p)
                      }}
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}
              <PaginationItem>
                <PaginationLink
                  href="#"
                  aria-label={t('ui.pager.next')}
                  aria-disabled={page >= totalPages}
                  className={
                    page >= totalPages ? 'pointer-events-none opacity-50' : ''
                  }
                  onClick={(e) => {
                    e.preventDefault()
                    if (page < totalPages) onPageChange(page + 1)
                  }}
                >
                  <ChevronRightIcon />
                </PaginationLink>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      ) : null}
    </div>
  )
}
