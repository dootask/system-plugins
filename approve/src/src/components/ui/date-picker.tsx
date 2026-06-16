import * as React from 'react'
import { CalendarIcon, Clock } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Button } from '#/components/ui/button'
import { Calendar } from '#/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { cn } from '#/lib/utils'
import { useT } from '#/lib/i18n/context'

// 表单/引擎统一以 'YYYY-MM-DD' 字符串存日期，这里只在显示层与 Date 互转，对外仍是字符串。
function strToDate(s?: string): Date | undefined {
  if (!s) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return undefined
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}
function dateToStr(d?: Date): string {
  if (!d) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function DatePicker({
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  value?: string
  onChange: (v: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const date = strToDate(value)
  const ph = placeholder ?? t('ui.date.pick')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start font-normal',
            !date && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="size-4" />
          {value || ph}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onChange(dateToStr(d))
            setOpen(false)
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}

// ───────────────────────── 时间（HH:mm，时/分两列滚动选择） ─────────────────────────
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i))
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i))

function TimeColumn({
  items,
  active,
  onPick,
}: {
  items: Array<string>
  active: string
  onPick: (v: string) => void
}) {
  return (
    <div className="h-52 w-16 overflow-y-auto py-1">
      {items.map((it) => (
        <button
          key={it}
          type="button"
          onClick={() => onPick(it)}
          className={cn(
            'flex w-full items-center justify-center rounded py-1.5 text-sm hover:bg-accent',
            active === it && 'bg-primary/10 font-medium text-primary',
          )}
        >
          {it}
        </button>
      ))}
    </div>
  )
}

export function TimePicker({
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  value?: string
  onChange: (v: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const [h = '', m = ''] = (value ?? '').split(':')
  const ph = placeholder ?? t('ui.time.pick')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'justify-start font-normal',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <Clock className="size-4" />
          {value || ph}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex divide-x">
          <TimeColumn
            items={HOURS}
            active={h}
            onPick={(hh) => onChange(`${hh}:${m || '00'}`)}
          />
          <TimeColumn
            items={MINUTES}
            active={m}
            onPick={(mm) => onChange(`${h || '00'}:${mm}`)}
          />
        </div>
        <div className="border-t p-2">
          <Button size="sm" className="w-full" onClick={() => setOpen(false)}>
            {t('ui.time.ok')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ───────────────────────── 日期时间（YYYY-MM-DD HH:mm） ─────────────────────────
// 对外仍是字符串：'YYYY-MM-DD HH:mm'。拆成"日期控件 + 时间控件"两个并排控件。
function splitDateTime(s?: string): { date: string; time: string } {
  if (!s) return { date: '', time: '' }
  const [d = '', t = ''] = s.trim().split(/[ T]/)
  return { date: d, time: t.slice(0, 5) }
}
function joinDateTime(date: string, time: string): string {
  if (!date) return ''
  return `${date} ${time || '00:00'}`
}

export function DateTimePicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value?: string
  onChange: (v: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}) {
  const t = useT()
  const { date, time } = splitDateTime(value)
  return (
    <div className={cn('flex gap-2', className)}>
      <DatePicker
        value={date}
        disabled={disabled}
        placeholder={t('ui.date.pick')}
        className="flex-1"
        onChange={(d) => onChange(joinDateTime(d, time))}
      />
      <TimePicker
        value={time}
        disabled={disabled || !date}
        placeholder={t('ui.time.label')}
        className="w-28"
        onChange={(tm) => onChange(joinDateTime(date, tm))}
      />
    </div>
  )
}

export function DateRangePicker({
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  value?: Array<string>
  onChange: (v: [string, string]) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const from = strToDate(value?.[0])
  const to = strToDate(value?.[1])
  const range: DateRange | undefined = from ? { from, to } : undefined
  const ph = placeholder ?? t('ui.date.pickRange')
  const label = value?.[0] ? `${value[0]} ~ ${value[1] || '…'}` : ph
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start font-normal',
            !from && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="size-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={range}
          onSelect={(r) => {
            onChange([dateToStr(r?.from), dateToStr(r?.to)])
            if (r?.from && r.to) setOpen(false)
          }}
          numberOfMonths={2}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
