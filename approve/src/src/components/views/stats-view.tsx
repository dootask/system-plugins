import { useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { api, ApiError, downloadAuthed } from '#/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { ErrorBar, Loading } from '#/components/ui/misc'
import { AdminTabs } from '#/components/admin-tabs'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { DatePicker } from '#/components/ui/date-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { confirmAction, downloadViaHost, warnMessage } from '#/lib/dootask'
import { cn } from '#/lib/utils'
import { useT } from '#/lib/i18n/context'

interface Stats {
  scope: 'all' | 'mine'
  total: number
  byStatus: Record<string, number>
  todo: number
}

const STATUS_LABEL_KEY = {
  draft: 'stats.status.draft',
  running: 'stats.status.running',
  approved: 'stats.status.approved',
  rejected: 'stats.status.rejected',
  withdrawn: 'stats.status.withdrawn',
  archived: 'stats.status.archived',
} as const

const STATUS_ORDER = [
  'running',
  'approved',
  'rejected',
  'withdrawn',
  'archived',
  'draft',
]

export function StatsView() {
  const t = useT()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => {
    api<Stats>('/stats')
      .then(setStats)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : t('stats.loadFailed')),
      )
      .finally(() => setLoading(false))
  }, [t])

  if (loading) return <Loading center />

  const entries = stats
    ? STATUS_ORDER.filter((s) => (stats.byStatus[s] ?? 0) > 0).map((s) => ({
        key: s,
        label:
          s in STATUS_LABEL_KEY
            ? t(STATUS_LABEL_KEY[s as keyof typeof STATUS_LABEL_KEY])
            : s,
        count: stats.byStatus[s] ?? 0,
      }))
    : []

  return (
    <div>
      <AdminTabs />
      {/* 标题独占一行；导出按钮另起一行（同「数据备份」），避免与右上角胶囊重叠 */}
      <h1 className="text-lg font-semibold max-md:hidden">
        {t('stats.title')}
      </h1>
      {stats ? (
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          {stats.scope === 'all'
            ? t('stats.scope.all')
            : t('stats.scope.mine')}
          {t('stats.scope.suffix')}
        </p>
      ) : null}
      {stats?.scope === 'all' ? (
        <div className="mb-4 flex">
          <Button
            className="ml-auto"
            onClick={() => setExportOpen(true)}
          >
            <Download className="size-4" /> {t('stats.export')}
          </Button>
        </div>
      ) : null}
      {error ? <ErrorBar message={error} /> : null}
      {stats ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label={t('stats.card.total')} count={stats.total} highlight />
            <StatCard label={t('stats.card.todo')} count={stats.todo} />
            {entries.map((e) => (
              <StatCard key={e.key} label={e.label} count={e.count} />
            ))}
          </div>
        </div>
      ) : null}
      {stats?.scope === 'all' ? (
        <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      ) : null}
    </div>
  )
}

function StatCard({
  label,
  count,
  highlight,
}: {
  label: string
  count: number
  highlight?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span
          className={
            highlight
              ? 'text-3xl font-semibold text-primary'
              : 'text-3xl font-semibold'
          }
        >
          {count}
        </span>
      </CardContent>
    </Card>
  )
}

// 导出可选状态（不选=全部状态）。
const EXPORT_STATUSES = [
  ['running', 'stats.status.running'],
  ['approved', 'stats.status.approved'],
  ['rejected', 'stats.status.rejected'],
  ['withdrawn', 'stats.status.withdrawn'],
  ['archived', 'stats.status.archived'],
] as const

const ALL_TEMPLATES = '__all__'

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/** 导出筛选弹窗：时间范围 + 状态(多选) + 模板 + 关键字 → XLSX 下载。 */
function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const t = useT()
  const [defs, setDefs] = useState<Array<{ id: number; name: string }>>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [statuses, setStatuses] = useState<Set<string>>(new Set())
  const [defId, setDefId] = useState(ALL_TEMPLATES)
  const [keyword, setKeyword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // 默认最近 30 天，避免一次导全量。
    const now = new Date()
    setTo(ymd(now))
    setFrom(ymd(new Date(now.getTime() - 29 * 86400000)))
    setError(null)
    api<{ items: Array<{ id: number; name: string }> }>(
      '/defs?all=1&pageSize=100',
    )
      .then((r) => setDefs(r.items))
      .catch(() => setDefs([]))
  }, [open])

  const toggleStatus = (s: string) =>
    setStatuses((prev) => {
      const n = new Set(prev)
      if (n.has(s)) n.delete(s)
      else n.add(s)
      return n
    })

  const buildQuery = () => {
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (statuses.size) p.set('statuses', [...statuses].join(','))
    if (defId !== ALL_TEMPLATES) p.set('defId', defId)
    if (keyword.trim()) p.set('keyword', keyword.trim())
    return p
  }

  async function doExport() {
    setBusy(true)
    setError(null)
    try {
      const p = buildQuery()
      const pre = await api<{ total: number; limit: number }>(
        `/admin/export?${p.toString()}&count=1`,
      )
      if (pre.total === 0) {
        await warnMessage(t('stats.export.empty'))
        return
      }
      if (pre.total > pre.limit) {
        const go = await confirmAction(
          t('stats.export.limitWarn', {
            total: pre.total,
            limit: pre.limit,
          }),
          t('stats.export.title'),
        )
        if (!go) return
      }
      const now = new Date()
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
        now.getDate(),
      ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(
        now.getMinutes(),
      ).padStart(2, '0')}`
      const fname = `${t('stats.export.fileName')}_${stamp}.xlsx`
      const qs = `${p.toString()}&fname=${encodeURIComponent(fname)}`
      // 走主程序 downloadUrl（传字符串 → 主程序自动拼当前用户 token），兼容各端原生下载；
      // 需绝对 URL（Electron/EEUI 用）。脱离宿主时回退浏览器 blob 下载（带 header 鉴权）。
      const abs = new URL(
        `/apps/approve/api/admin/export?${qs}`,
        window.location.href,
      ).href
      await downloadViaHost(abs, () => downloadAuthed(`/admin/export?${qs}`, fname))
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('stats.export.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('stats.export.title')}</DialogTitle>
          <DialogDescription>{t('stats.export.desc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t('stats.export.from')}
              </Label>
              <DatePicker
                value={from}
                onChange={setFrom}
                placeholder={t('stats.export.datePlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t('stats.export.to')}
              </Label>
              <DatePicker
                value={to}
                onChange={setTo}
                placeholder={t('stats.export.datePlaceholder')}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t('stats.export.statusLabel')}
            </Label>
            <div className="flex flex-wrap gap-2">
              {EXPORT_STATUSES.map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggleStatus(v)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm transition-colors',
                    statuses.has(v)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {t(l)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t('stats.export.templateLabel')}
            </Label>
            <Select value={defId} onValueChange={setDefId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TEMPLATES}>
                  {t('stats.export.allTemplates')}
                </SelectItem>
                {defs.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {defId !== ALL_TEMPLATES ? (
              <p className="text-xs text-muted-foreground">
                {t('stats.export.templateHint')}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t('stats.export.keywordLabel')}
            </Label>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t('stats.export.keywordPlaceholder')}
            />
          </div>

          {error ? <ErrorBar message={error} /> : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t('common.cancel')}
          </Button>
          <Button onClick={doExport} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('stats.export.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
