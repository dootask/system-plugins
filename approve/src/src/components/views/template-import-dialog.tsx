import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { api, ApiError } from '#/lib/api'
import { confirmAction } from '#/lib/dootask'
import { cn } from '#/lib/utils'
import { useT } from '#/lib/i18n/context'
import { CATEGORY_GROUPS, groupLabelKey, groupOf } from '#/lib/categories'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { ScrollArea } from '#/components/ui/scroll-area'
import { ErrorBar, Loading } from '#/components/ui/misc'

interface PresetItem {
  key: string
  name: string
  category: string
  icon: string | null
  exists: boolean
}

/**
 * 预设模板批量导入弹窗（仅新建模板页用）。
 * 多选预设 → 「导入」直接批量建模板（不写入当前编辑器表单）；含同名时先二次确认。
 * 导入成功回调 onImported 由调用方处理（跳回模板列表）。
 */
export function TemplateImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onImported: () => void
}) {
  const t = useT()
  const [items, setItems] = useState<Array<PresetItem>>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    setError(null)
    setLoading(true)
    api<{ items: Array<PresetItem> }>('/admin/presets')
      .then((r) => setItems(r.items))
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : t('designer.import.loadFailed')),
      )
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // 整组全选/全不选：组内全部已选 → 取消该组；否则补齐该组。
  const toggleGroup = (keys: Array<string>, allSelected: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const k of keys) {
        if (allSelected) next.delete(k)
        else next.add(k)
      }
      return next
    })

  // 按分组归类（沿用发起页分组，CATEGORY_GROUPS 顺序），去掉空组。
  const groups = useMemo(
    () =>
      CATEGORY_GROUPS.map((g) => ({
        code: g.code,
        items: items.filter((it) => groupOf(it.category) === g.code),
      })).filter((g) => g.items.length > 0),
    [items],
  )

  const doImport = async () => {
    const keys = [...selected]
    if (keys.length === 0) return
    const dupCount = items.filter((i) => selected.has(i.key) && i.exists).length
    if (dupCount > 0) {
      const go = await confirmAction(
        t('designer.import.dupConfirm', { count: dupCount }),
        t('designer.import.title'),
      )
      if (!go) return
    }
    setBusy(true)
    setError(null)
    try {
      await api('/admin/presets', { method: 'POST', json: { keys } })
      onOpenChange(false)
      onImported()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('designer.import.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('designer.import.title')}</DialogTitle>
          <DialogDescription>{t('designer.import.desc')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <Loading center />
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('designer.import.empty')}
          </p>
        ) : (
          <ScrollArea className="max-h-[55vh] pr-3">
            <div className="space-y-4">
              {groups.map((g) => {
                const allSelected = g.items.every((it) => selected.has(it.key))
                return (
                <div key={g.code} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t(groupLabelKey(g.code))}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        toggleGroup(
                          g.items.map((it) => it.key),
                          allSelected,
                        )
                      }
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {allSelected
                        ? t('designer.import.deselectAll')
                        : t('designer.import.selectAll')}
                    </button>
                  </div>
                  {g.items.map((item) => {
                    const checked = selected.has(item.key)
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => toggle(item.key)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                          checked
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-muted',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-4 shrink-0 items-center justify-center rounded border',
                            checked
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-input',
                          )}
                        >
                          {checked ? <Check className="size-3" /> : null}
                        </span>
                        <span className="text-base leading-none">
                          {item.icon || '📄'}
                        </span>
                        <span className="flex-1 font-medium">{item.name}</span>
                        {item.exists ? (
                          <Badge variant="secondary" className="shrink-0">
                            {t('designer.import.exists')}
                          </Badge>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
                )
              })}
            </div>
          </ScrollArea>
        )}

        {error ? <ErrorBar message={error} /> : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t('common.cancel')}
          </Button>
          <Button onClick={doImport} disabled={busy || selected.size === 0}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {selected.size > 0
              ? t('designer.import.submitCount', { count: selected.size })
              : t('designer.import.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
