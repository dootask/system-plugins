import { useEffect, useState } from 'react'
import { api, ApiError } from '#/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { ErrorBar, Loading } from '#/components/ui/misc'
import { AdminTabs } from '#/components/admin-tabs'

interface Stats {
  scope: 'all' | 'mine'
  total: number
  byStatus: Record<string, number>
  todo: number
}

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  running: '审批中',
  approved: '已通过',
  rejected: '已拒绝',
  withdrawn: '已撤回',
  archived: '已归档',
}

const STATUS_ORDER = [
  'running',
  'approved',
  'rejected',
  'withdrawn',
  'archived',
  'draft',
]

export function StatsView() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Stats>('/stats')
      .then(setStats)
      .catch((e) => setError(e instanceof ApiError ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading center />

  const entries = stats
    ? STATUS_ORDER.filter((s) => (stats.byStatus[s] ?? 0) > 0).map((s) => ({
        key: s,
        label: STATUS_LABEL[s] ?? s,
        count: stats.byStatus[s] ?? 0,
      }))
    : []

  return (
    <div>
      <AdminTabs />
      <h1 className="mb-4 text-lg font-semibold max-md:hidden">数据统计</h1>
      {error ? <ErrorBar message={error} /> : null}
      {stats ? (
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">
            {stats.scope === 'all' ? '全部审批单' : '我发起的审批单'}统计
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label="总数" count={stats.total} highlight />
            <StatCard label="待我审批" count={stats.todo} />
            {entries.map((e) => (
              <StatCard key={e.key} label={e.label} count={e.count} />
            ))}
          </div>
        </div>
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
