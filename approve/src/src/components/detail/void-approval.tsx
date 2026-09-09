import { useState } from 'react'
import { Ban } from 'lucide-react'
import { api, ApiError } from '#/lib/api'
import { useT } from '#/lib/i18n/context'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import { ErrorBar } from '#/components/ui/misc'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'

export function VoidApproval({
  instId,
  title,
  onVoided,
}: {
  instId: number
  title: string
  onVoided: () => Promise<void>
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!reason.trim() || reason.trim().length > 1000) {
      setError(t('engine.voidReasonRequired'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api(`/admin/insts/${instId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      })
      setOpen(false)
      await onVoided()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('detail.error.action'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (busy) return
        setOpen(value)
        setReason('')
        setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Ban className="size-4" />
          {t('adminInst.void')}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('adminInst.void')}</DialogTitle>
            <DialogDescription className="break-words">
              {t('adminInst.confirm', { title })}
            </DialogDescription>
          </DialogHeader>
          {error ? <ErrorBar message={error} /> : null}
          <div className="space-y-2">
            <Label htmlFor="void-reason">{t('adminInst.reason')}</Label>
            <Textarea
              id="void-reason"
              required
              maxLength={1000}
              rows={4}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={busy || !reason.trim()}
            >
              <Ban className="size-4" />
              {t('adminInst.void')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
