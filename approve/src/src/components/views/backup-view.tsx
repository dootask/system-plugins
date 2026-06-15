import { useEffect, useState } from 'react'
import { Database, Download, RotateCcw, Trash2 } from 'lucide-react'
import { api, ApiError, downloadAuthed } from '#/lib/api'
import { confirmAction, useDooTask } from '#/lib/dootask'
import { Button } from '#/components/ui/button'
import { EmptyState, ErrorBar, Loading, formatTime } from '#/components/ui/misc'

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
  const { status: dtStatus } = useDooTask()
  const [items, setItems] = useState<Array<BackupEntry>>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    api<{ items: Array<BackupEntry> }>('/admin/backups')
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : '加载失败'))
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
      setError(e instanceof ApiError ? e.message : '备份失败')
    } finally {
      setBusy(false)
    }
  }
  const doDownload = async (name: string) => {
    try {
      await downloadAuthed(`/admin/backups/${name}`, name)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '下载失败')
    }
  }
  const doRestore = async (name: string) => {
    if (
      !(await confirmAction(
        `确认用「${name}」还原数据库？当前数据将被覆盖，且不可恢复。`,
      ))
    )
      return
    setBusy(true)
    setError(null)
    try {
      await api(`/admin/backups/${name}`, { method: 'POST' })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '还原失败')
    } finally {
      setBusy(false)
    }
  }
  const doDelete = async (name: string) => {
    if (!(await confirmAction(`确认删除备份「${name}」？`))) return
    setBusy(true)
    setError(null)
    try {
      await api(`/admin/backups/${name}`, { method: 'DELETE' })
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {/* 桌面端标题独占一行（移动端顶部标题栏已显示） */}
      <h1 className="text-lg font-semibold max-md:hidden">数据备份</h1>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        备份 / 还原 /
        下载审批数据库。附件存于主程序文件库并随其留存，不在本备份范围内。
      </p>

      <div className="mb-4 flex">
        <Button onClick={doBackup} disabled={busy} className="ml-auto">
          <Database className="size-4" /> 立即备份
        </Button>
      </div>

      {error ? <ErrorBar message={error} /> : null}

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState title="暂无备份" hint="点击「立即备份」创建第一个备份" />
      ) : (
        <div className="divide-y">
          {items.map((b) => (
            <div
              key={b.name}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-medium">
                  {b.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatTime(b.createdAt)} · {formatBytes(b.size)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => doDownload(b.name)}
                  disabled={busy}
                >
                  <Download className="size-4" /> 下载
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => doRestore(b.name)}
                  disabled={busy}
                >
                  <RotateCcw className="size-4" /> 还原
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => doDelete(b.name)}
                  disabled={busy}
                >
                  <Trash2 className="size-4" /> 删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
