import { useEffect, useState } from 'react'
import { Database } from 'lucide-react'
import { api, ApiError, downloadAuthed } from '#/lib/api'
import { confirmAction, useDooTask } from '#/lib/dootask'
import { Button } from '#/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { EmptyState, ErrorBar, Loading, formatTime } from '#/components/ui/misc'
import { AdminTabs } from '#/components/admin-tabs'
import { useT } from '#/lib/i18n/context'

interface BackupEntry {
  name: string
  size: number
  createdAt: string
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function BackupView() {
  const t = useT()
  const { status: dtStatus } = useDooTask()
  const [items, setItems] = useState<Array<BackupEntry>>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    api<{ items: Array<BackupEntry> }>('/admin/backups')
      .then((r) => setItems(r.items))
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : t('backup.loadFailed')),
      )
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    if (dtStatus === 'ready') load()
    else if (dtStatus !== 'loading') setLoading(false)
  }, [dtStatus])

  const doBackup = async () => {
    setBusy(true)
    setError(null)
    try {
      await api('/admin/backups', { method: 'POST' })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('backup.backupFailed'))
    } finally {
      setBusy(false)
    }
  }
  const doDownload = async (name: string) => {
    try {
      await downloadAuthed(`/admin/backups/${name}`, name)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('backup.downloadFailed'))
    }
  }
  const doRestore = async (name: string) => {
    if (
      !(await confirmAction(
        t('backup.restore.confirm', { name }),
        t('backup.restore.confirmTitle'),
      ))
    )
      return
    setBusy(true)
    setError(null)
    try {
      await api(`/admin/backups/${name}`, { method: 'POST' })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('backup.restoreFailed'))
    } finally {
      setBusy(false)
    }
  }
  const doDelete = async (name: string) => {
    if (
      !(await confirmAction(
        t('backup.delete.confirm', { name }),
        t('backup.delete.confirmTitle'),
      ))
    )
      return
    setBusy(true)
    setError(null)
    try {
      await api(`/admin/backups/${name}`, { method: 'DELETE' })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('backup.deleteFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <AdminTabs />
      {/* 桌面端标题独占一行（移动端顶部标题栏已显示） */}
      <h1 className="text-lg font-semibold max-md:hidden">
        {t('backup.title')}
      </h1>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        {t('backup.desc')}
      </p>

      <div className="mb-4 flex">
        <Button onClick={doBackup} disabled={busy} className="ml-auto">
          <Database className="size-4" /> {t('backup.now')}
        </Button>
      </div>

      {error ? <ErrorBar message={error} /> : null}

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState
          title={t('backup.empty.title')}
          hint={t('backup.empty.hint')}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('backup.col.name')}</TableHead>
              <TableHead>{t('backup.col.createdAt')}</TableHead>
              <TableHead>{t('backup.col.size')}</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((b) => (
              <TableRow key={b.name}>
                <TableCell className="font-mono font-medium">{b.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatTime(b.createdAt)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatBytes(b.size)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => doDownload(b.name)}
                    disabled={busy}
                  >
                    {t('backup.download')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => doRestore(b.name)}
                    disabled={busy}
                  >
                    {t('backup.restore')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => doDelete(b.name)}
                    disabled={busy}
                  >
                    {t('common.delete')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
