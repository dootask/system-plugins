import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '#/lib/api'
import { useDooTask } from '#/lib/dootask'
import {
  fmtBytes,
  fmtDuration,
  fmtNum,
  makeT,
  resolveLocale,
  type Locale,
  type MsgKey,
} from '#/lib/i18n'
import type { DashboardStatus } from '#/lib/status'
import {
  Btn,
  Card,
  CardHeader,
  Chip,
  ConfirmModal,
  Dot,
  Progress,
} from '#/components/ui'

export const Route = createFileRoute('/')({
  validateSearch: (s: Record<string, unknown>) => ({
    lang: typeof s.lang === 'string' ? s.lang : undefined,
  }),
  component: Dashboard,
})

interface FailureItem {
  id: number
  data_type: string
  data_id: number
  action: string
  error_message: string | null
  retry_count: number
  nextRetryInMinutes: number
}

interface TestHit {
  id: number
  snippet: string
  score: number
  source: 'fulltext' | 'vector' | 'both'
}

const TYPE_ICONS: Record<string, string> = {
  msg: '💬',
  file: '📄',
  task: '✅',
  project: '📁',
  user: '👤',
}
const TYPE_LABEL_KEYS: Record<string, MsgKey> = {
  msg: 'typeMsg',
  file: 'typeFile',
  task: 'typeTask',
  project: 'typeProject',
  user: 'typeUser',
}
const TASK_LABEL_KEYS: Record<string, MsgKey> = {
  msg: 'taskMsg',
  file: 'taskFile',
  task: 'taskTask',
  project: 'taskProject',
  user: 'taskUser',
  retry: 'taskRetry',
}

function Dashboard() {
  const { lang } = Route.useSearch()
  const locale: Locale = resolveLocale(lang)
  const t = makeT(locale)
  useDooTask()

  const [status, setStatus] = useState<DashboardStatus | null>(null)
  const [failures, setFailures] = useState<Array<FailureItem>>([])
  const [authError, setAuthError] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([
        api<DashboardStatus>('/status'),
        api<Array<FailureItem>>('/failures?limit=20'),
      ])
      setStatus(s)
      setFailures(f)
      setAuthError(null)
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setAuthError(e.status)
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 10_000)
    return () => clearInterval(timer)
  }, [refresh])

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-sm text-slate-500 dark:text-slate-400">
        {authError === 403 ? t('notAdmin') : t('unauthorized')}
      </div>
    )
  }

  return (
    <div
      className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-5"
      style={{
        paddingTop: 'calc(var(--safe-top) + 1.25rem)',
        paddingBottom: 'calc(var(--safe-bottom) + 1rem)',
      }}
    >
      <Header t={t} status={status} />
      <Overview t={t} locale={locale} status={status} />
      <Coverage t={t} locale={locale} status={status} refresh={refresh} showToast={showToast} />
      <div className="grid lg:grid-cols-2 gap-4">
        <SyncTasks t={t} locale={locale} status={status} refresh={refresh} showToast={showToast} />
        <FailureQueue
          t={t}
          status={status}
          failures={failures}
          refresh={refresh}
          showToast={showToast}
        />
      </div>
      <SearchTest t={t} />
      <DangerZone t={t} refresh={refresh} showToast={showToast} />
      <div className="text-center text-xs text-slate-300 dark:text-slate-600 pb-2">
        {t('adminOnly')}
      </div>
      {toast ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs rounded-full px-4 py-2 shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  )
}

type T = ReturnType<typeof makeT>

function Header({ t, status }: { t: T; status: DashboardStatus | null }) {
  const online = status?.engine.online
  return (
    // 右侧留白给主程序悬浮胶囊（更多/关闭）
    <div className="flex items-center justify-between pr-20">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        {status ? (
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-0.5 border ${
              online
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950 dark:border-emerald-900'
                : 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-900'
            }`}
          >
            <Dot color={online ? 'green' : 'red'} />
            {online ? t('engineOnline') : t('engineOffline')}
          </span>
        ) : null}
      </div>
      <div className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block">
        {t('autoRefresh')}
      </div>
    </div>
  )
}

function Overview({
  t,
  locale,
  status,
}: {
  t: T
  locale: Locale
  status: DashboardStatus | null
}) {
  const s = status
  const vs = s?.vectorService
  const modelMismatch = Boolean(
    vs?.cachedModel && vs?.storedModel && vs.cachedModel !== vs.storedModel,
  )
  const failTotal = s?.failures.total ?? 0
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <Card className="p-4">
        <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">{t('cardEngine')}</div>
        <div className="text-lg font-semibold truncate">
          {s ? `Manticore ${s.engine.version || '—'}` : '…'}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
          {s
            ? `${t('up')} ${fmtDuration(locale, s.engine.uptimeSec)} · ${t('disk')} ${fmtBytes(s.engine.diskBytes)}`
            : ''}
        </div>
      </Card>
      <Card className="p-4">
        <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">{t('cardVector')}</div>
        <div className="text-lg font-semibold flex items-center gap-2">
          {s ? (vs?.reachable ? t('ok') : t('unreachable')) : '…'}
          {s ? <Dot color={vs?.reachable ? 'green' : 'red'} /> : null}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
          {vs?.model || vs?.cachedModel || '—'}
          {vs?.dims ? ` · ${vs.dims} ${t('dims')}` : ''}
        </div>
        {modelMismatch ? (
          <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{t('modelMismatch')}</div>
        ) : null}
      </Card>
      <Card className="p-4">
        <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">{t('cardIndexed')}</div>
        <div className="text-lg font-semibold">
          {s ? fmtNum(s.totals.indexed) : '…'}{' '}
          <span className="text-sm font-normal text-slate-400">{t('unit')}</span>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {s?.totals.ratePerMin ? t('perMinNow', { n: fmtNum(s.totals.ratePerMin) }) : ''}
        </div>
      </Card>
      <Card
        className={`p-4 ${failTotal > 0 ? 'border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30' : ''}`}
      >
        <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">{t('cardFailures')}</div>
        <div
          className={`text-lg font-semibold ${failTotal > 0 ? 'text-amber-700 dark:text-amber-400' : ''}`}
        >
          {s ? fmtNum(failTotal) : '…'}{' '}
          <span className="text-sm font-normal text-slate-400">{t('unit')}</span>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {s
            ? failTotal > 0 && s.failures.oldestAgeSec != null
              ? `${t('oldestAgo', { t: fmtDuration(locale, s.failures.oldestAgeSec) })} · ${t('autoRetrying')}`
              : t('noFailures')
            : ''}
        </div>
      </Card>
    </div>
  )
}

function Coverage({
  t,
  locale,
  status,
  refresh,
  showToast,
}: {
  t: T
  locale: Locale
  status: DashboardStatus | null
  refresh: () => Promise<void>
  showToast: (m: string) => void
}) {
  const [confirmType, setConfirmType] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const history = status?.totals.history ?? []
  const deltas: Array<number> = []
  for (let i = 1; i < history.length; i++) {
    const mins = (history[i].t - history[i - 1].t) / 60_000
    deltas.push(mins > 0 ? Math.max(0, (history[i].total - history[i - 1].total) / mins) : 0)
  }
  const maxDelta = Math.max(1, ...deltas)

  const doRefill = async (type: string) => {
    setBusy(true)
    try {
      await api('/refill', { method: 'POST', json: { type } })
      showToast(t('refillStarted'))
      await refresh()
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('loadFailed'))
    } finally {
      setBusy(false)
      setConfirmType(null)
    }
  }

  return (
    <Card>
      <CardHeader title={t('coverage')} hint={t('coverageHint')} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-xs text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
              <th className="text-left font-medium px-4 sm:px-5 py-2">{t('colType')}</th>
              <th className="text-right font-medium px-3 py-2">{t('colSource')}</th>
              <th className="text-right font-medium px-3 py-2">{t('colIndexed')}</th>
              <th className="text-left font-medium px-4 py-2 w-52">{t('colCoverage')}</th>
              <th className="text-left font-medium px-3 py-2">{t('colState')}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
            {(status?.coverage ?? []).map((row) => (
              <tr key={row.type}>
                <td className="px-4 sm:px-5 py-3 font-medium whitespace-nowrap">
                  {TYPE_ICONS[row.type]} {t(TYPE_LABEL_KEYS[row.type])}
                </td>
                <td className="px-3 py-3 text-right text-slate-500 dark:text-slate-400">
                  {fmtNum(row.source)}
                </td>
                <td className="px-3 py-3 text-right">{fmtNum(row.indexed)}</td>
                <td className="px-4 py-3">
                  <Progress percent={row.percent} tone={row.state === 'synced' ? 'green' : 'blue'} />
                </td>
                <td className="px-3 py-3">
                  {row.state === 'synced' ? (
                    <Chip tone="green">{t('synced')}</Chip>
                  ) : row.state === 'missing' ? (
                    <Chip tone="red">{t('missing')}</Chip>
                  ) : (
                    <Chip tone="blue">
                      {t('syncing')}
                      {row.ratePerMin ? ` · ${t('rowsPerMin', { n: fmtNum(row.ratePerMin) })}` : ''}
                      {row.etaMinutes
                        ? ` · ${t('etaAbout', { t: fmtDuration(locale, row.etaMinutes * 60) })}`
                        : ''}
                    </Chip>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <Btn tone="gray" onClick={() => setConfirmType(row.type)}>
                    {t('refill')}
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {deltas.length >= 2 ? (
        <div className="px-4 sm:px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-end gap-3">
          <span className="text-xs text-slate-400 dark:text-slate-500 pb-0.5 shrink-0">
            {t('writeRate')}
          </span>
          <div className="flex items-end gap-[3px] h-8 flex-1 overflow-hidden">
            {deltas.slice(-30).map((d, i) => (
              <div
                key={i}
                className="w-2 bg-blue-300 dark:bg-blue-700 rounded-sm shrink-0"
                style={{ height: `${Math.max(6, Math.round((d / maxDelta) * 100))}%` }}
              />
            ))}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 pb-0.5 shrink-0">
            {t('rowsPerMin', { n: fmtNum(Math.round(deltas[deltas.length - 1])) })}
          </span>
        </div>
      ) : null}
      <ConfirmModal
        open={confirmType !== null}
        title={t('refillConfirmTitle', {
          type: confirmType ? makeTypeLabel(t, confirmType) : '',
        })}
        desc={t('refillConfirmDesc')}
        confirmLabel={busy ? '…' : t('confirm')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={() => confirmType && void doRefill(confirmType)}
        onClose={() => setConfirmType(null)}
      />
    </Card>
  )
}

function makeTypeLabel(t: T, type: string): string {
  return t(TYPE_LABEL_KEYS[type] ?? 'typeMsg')
}

function SyncTasks({
  t,
  locale,
  status,
  refresh,
  showToast,
}: {
  t: T
  locale: Locale
  status: DashboardStatus | null
  refresh: () => Promise<void>
  showToast: (m: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const cron = status?.cron
  const anyStuck = status?.syncTasks.some((x) => x.stuck)

  const clearLocks = async () => {
    setBusy(true)
    try {
      const r = await api<{ cleared: number }>('/locks/clear', { method: 'POST' })
      showToast(t('clearLocksDone', { n: r.cleared }))
      await refresh()
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('loadFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title={t('syncTasks')}
        right={
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {cron
              ? cron.lastRunAgoSec == null
                ? t('cronUnknown')
                : cron.healthy
                  ? `${t('cronHeartbeat', { t: fmtDuration(locale, cron.lastRunAgoSec) })} ✓`
                  : t('cronStale', { t: fmtDuration(locale, cron.lastRunAgoSec) })
              : ''}
          </span>
        }
      />
      <div className="divide-y divide-slate-50 dark:divide-slate-800/60 text-sm">
        {(status?.syncTasks ?? []).map((task) => (
          <div
            key={task.key}
            className={`px-4 sm:px-5 py-2.5 flex items-center justify-between gap-2 ${
              task.stuck ? 'bg-red-50/50 dark:bg-red-950/20' : ''
            }`}
          >
            <span className="flex items-center gap-2 flex-wrap">
              {t(TASK_LABEL_KEYS[task.key] ?? 'taskRetry')}
              {task.stuck ? (
                <Chip tone="red">{t('stuck', { t: fmtDuration(locale, task.ageSec ?? 0) })}</Chip>
              ) : null}
            </span>
            {task.stuck ? (
              <Btn tone="red" busy={busy} onClick={() => void clearLocks()}>
                {t('clearLocks')}
              </Btn>
            ) : task.running ? (
              <Chip tone="blue">{t('running', { t: fmtDuration(locale, task.ageSec ?? 0) })}</Chip>
            ) : (
              <Chip tone="gray">{t('idle')}</Chip>
            )}
          </div>
        ))}
      </div>
      {anyStuck === false && !busy ? null : null}
    </Card>
  )
}

function FailureQueue({
  t,
  status,
  failures,
  refresh,
  showToast,
}: {
  t: T
  status: DashboardStatus | null
  failures: Array<FailureItem>
  refresh: () => Promise<void>
  showToast: (m: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const total = status?.failures.total ?? 0

  const act = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true)
    try {
      await fn()
      if (okMsg) showToast(okMsg)
      await refresh()
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('loadFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title={
          <>
            {t('failureQueue')}{' '}
            <span className="text-xs font-normal text-slate-400 ml-1">{fmtNum(total)}</span>
          </>
        }
        right={
          total > 0 ? (
            <Btn
              tone="blue"
              busy={busy}
              onClick={() => void act(() => api('/failures', { method: 'POST' }), t('retryAllDone'))}
            >
              {t('retryAll')}
            </Btn>
          ) : undefined
        }
      />
      {failures.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-slate-400 dark:text-slate-500">
          {t('emptyQueue')} 🎉
        </div>
      ) : (
        <div className="divide-y divide-slate-50 dark:divide-slate-800/60 text-sm">
          {failures.map((f) => (
            <div key={f.id} className="px-4 sm:px-5 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-xs">
                  {TYPE_ICONS[f.data_type] ?? ''} {makeTypeLabel(t, f.data_type)} #{f.data_id}{' '}
                  <span className="text-slate-400 font-normal">
                    · {f.action === 'delete' ? t('actionDelete') : t('actionSync')}
                  </span>
                </span>
                <span className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={busy}
                    className="text-xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 px-1.5 disabled:opacity-50"
                    onClick={() =>
                      void act(() => api(`/failures/${f.id}`, { method: 'POST' }), t('retryAllDone'))
                    }
                  >
                    {t('retry')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="text-xs text-slate-400 hover:text-red-500 px-1.5 disabled:opacity-50"
                    onClick={() => void act(() => api(`/failures/${f.id}`, { method: 'DELETE' }))}
                  >
                    {t('del')}
                  </button>
                </span>
              </div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                {f.error_message || '—'} · {t('retriedTimes', { n: f.retry_count })} ·{' '}
                {f.nextRetryInMinutes > 0
                  ? t('nextRetryIn', { n: f.nextRetryInMinutes })
                  : t('nextRetryNow')}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function SearchTest({ t }: { t: T }) {
  const [q, setQ] = useState('')
  const [type, setType] = useState('msg')
  const [mode, setMode] = useState('hybrid')
  const [hits, setHits] = useState<Array<TestHit> | null>(null)
  const [tookMs, setTookMs] = useState(0)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (!q.trim()) return
    setBusy(true)
    try {
      const r = await api<{ hits: Array<TestHit>; tookMs: number }>(
        `/search-test?q=${encodeURIComponent(q)}&type=${type}&mode=${mode}`,
      )
      setHits(r.hits)
      setTookMs(r.tookMs)
    } catch (e) {
      setHits([])
      setTookMs(0)
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  const srcLabel = (s: TestHit['source']) =>
    s === 'both' ? t('srcBoth') : s === 'vector' ? t('srcVector') : t('srcFulltext')

  return (
    <Card>
      <CardHeader title={t('searchTest')} hint={t('searchTestHint')} />
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void run()}
            className="flex-1 text-sm border border-slate-200 dark:border-slate-700 bg-transparent rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            placeholder={t('queryPlaceholder')}
          />
          <div className="flex gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-2 py-2 text-slate-600 dark:text-slate-300"
            >
              {(['msg', 'file', 'task', 'project', 'user'] as const).map((v) => (
                <option key={v} value={v}>
                  {t(TYPE_LABEL_KEYS[v])}
                </option>
              ))}
            </select>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-2 py-2 text-slate-600 dark:text-slate-300"
            >
              <option value="hybrid">{t('modeHybrid')}</option>
              <option value="fulltext">{t('modeFulltext')}</option>
              <option value="vector">{t('modeVector')}</option>
            </select>
            <Btn tone="primary" busy={busy} onClick={() => void run()} className="px-4 py-2">
              {t('search')}
            </Btn>
          </div>
        </div>
        {hits !== null ? (
          hits.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-4">{t('noHits')}</div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-slate-400">{t('tookMs', { n: tookMs })}</div>
              {hits.map((h, i) => (
                <div
                  key={`${h.id}-${i}`}
                  className="flex items-center gap-3 text-sm border border-slate-100 dark:border-slate-800 rounded-lg px-3 py-2"
                >
                  <span className="text-xs text-slate-400 shrink-0">#{i + 1}</span>
                  <span className="flex-1 truncate">{h.snippet || `id=${h.id}`}</span>
                  <span className="text-xs text-slate-400 shrink-0 hidden sm:inline">
                    {srcLabel(h.source)} {h.score.toFixed(2)}
                  </span>
                  <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full shrink-0 hidden sm:block">
                    <div
                      className={`h-full rounded-full ${h.source === 'fulltext' ? 'bg-blue-500' : 'bg-violet-500'}`}
                      style={{ width: `${Math.min(100, Math.round(h.score * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>
    </Card>
  )
}

function DangerZone({
  t,
  refresh,
  showToast,
}: {
  t: T
  refresh: () => Promise<void>
  showToast: (m: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const doRebuild = async () => {
    setBusy(true)
    try {
      await api('/rebuild', { method: 'POST', json: { confirm: 'REBUILD' } })
      showToast(t('rebuildStarted'))
      await refresh()
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('loadFailed'))
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <Card className="border-red-200 dark:border-red-900">
      <div className="px-4 sm:px-5 py-3.5 border-b border-red-100 dark:border-red-950">
        <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">{t('dangerZone')}</h2>
      </div>
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{t('rebuildTitle')}</div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t('rebuildDesc')}</div>
        </div>
        <Btn tone="red" busy={busy} onClick={() => setOpen(true)} className="px-4 py-2 shrink-0 self-start sm:self-auto">
          {t('rebuildBtn')}
        </Btn>
      </div>
      <ConfirmModal
        open={open}
        title={t('rebuildTitle')}
        desc={t('rebuildDesc')}
        requireWord="REBUILD"
        requireHint={t('rebuildConfirmHint', { word: 'REBUILD' })}
        confirmLabel={busy ? '…' : t('confirm')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={() => void doRebuild()}
        onClose={() => setOpen(false)}
      />
    </Card>
  )
}
