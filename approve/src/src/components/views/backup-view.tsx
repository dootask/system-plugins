import { useEffect, useRef, useState } from 'react'
import { Database, Upload } from 'lucide-react'
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
  const [notice, setNotice] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [maxUploadBytes, setMaxUploadBytes] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = () => {
    api<{ items: Array<BackupEntry>; maxUploadBytes: number }>('/admin/backups')
      .then((r) => {
        setItems(r.items)
        setMaxUploadBytes(r.maxUploadBytes)
      })
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
    setNotice(null)
    try {
      await api('/admin/backups', { method: 'POST' })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('backup.backupFailed'))
    } finally {
      setBusy(false)
    }
  }
  const doUpload = async (file: File) => {
    if (busy) return
    setError(null)
    setNotice(null)
    if (!/\.(zip|db)$/i.test(file.name) || !file.size) {
      setError(t('backup.invalidFile'))
      return
    }
    if (maxUploadBytes !== null && file.size > maxUploadBytes) {
      setError(t('backup.uploadTooLarge'))
      return
    }
    setBusy(true)
    setUploading(true)
    try {
      const result = await api<BackupEntry>(
        `/admin/backups?name=${encodeURIComponent(file.name)}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/octet-stream' },
          body: file,
        },
      )
      setNotice(t('backup.uploaded', { name: result.name }))
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('backup.operationFailed'))
    } finally {
      setBusy(false)
      setUploading(false)
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
      setNotice(null)
      const result = await api<{ safetyBackup: string }>(
        `/admin/backups/${name}`,
        { method: 'POST' },
      )
      setNotice(t('backup.restored', { name: result.safetyBackup }))
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

      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <input
          ref={fileInput}
          type="file"
          accept=".zip,.db"
          className="hidden"
          aria-label={t('backup.upload')}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void doUpload(file)
          }}
        />
        <Button
          variant="outline"
          onClick={() => fileInput.current?.click()}
          disabled={busy || maxUploadBytes === null}
        >
          <Upload className="size-4" />{' '}
          {t(uploading ? 'backup.uploading' : 'backup.upload')}
        </Button>
        <Button onClick={doBackup} disabled={busy}>
          <Database className="size-4" /> {t('backup.now')}
        </Button>
      </div>

      {error ? <ErrorBar message={error} /> : null}
      {notice ? (
        <p role="status" className="mb-4 break-all text-sm">
          {notice}
        </p>
      ) : null}

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
                <TableCell className="font-mono font-medium">
                  {b.name}
                </TableCell>
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
