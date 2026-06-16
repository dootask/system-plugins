import { useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'

// 常用图标（审批/办公场景），无需外部依赖。
const EMOJIS = [
  '📄', '📝', '📋', '✅', '📌', '📎', '🗂️', '📁',
  '💼', '🧾', '💰', '💳', '🧮', '📊', '📈', '🕒',
  '📅', '🌴', '🌙', '✈️', '🚗', '🏨', '🍽️', '🎫',
  '🛠️', '🔧', '⚙️', '🧪', '🔬', '💻', '🖥️', '📱',
  '🔐', '🛡️', '👤', '👥', '🏢', '🏬', '🚀', '⭐',
  '🎯', '📦', '🎓', '❤️', '🔔', '📣', '⚠️', '❓',
]

/** emoji 图标选择器（Popover + 网格）。value 为空显示占位 📄。 */
export function EmojiPicker({
  value,
  onChange,
  className,
}: {
  value?: string
  onChange: (v: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('h-9 w-11 text-lg', className)}
        >
          {value || '📄'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="grid grid-cols-8 gap-1">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onChange(e)
                setOpen(false)
              }}
              className={cn(
                'flex size-7 items-center justify-center rounded text-lg hover:bg-accent',
                value === e && 'bg-accent',
              )}
            >
              {e}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            onChange('')
            setOpen(false)
          }}
          className="mt-2 w-full rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          默认图标
        </button>
      </PopoverContent>
    </Popover>
  )
}
