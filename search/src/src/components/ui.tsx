/**
 * 极简 UI 原件（纯 Tailwind，明暗双主题）。
 * 确认框/消息统一走 @dootask/tools（见 lib/dialogs.ts），本文件只保留展示原件。
 */
import { Loader2 } from 'lucide-react'

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`bg-white dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 ${className}`}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  hint,
  right,
}: {
  title: React.ReactNode
  hint?: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="px-4 sm:px-5 h-14 shrink-0 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold min-w-0 truncate">
        {title}
        {hint ? (
          <span className="text-xs font-normal text-slate-400 dark:text-neutral-500 ml-2 hidden sm:inline">
            {hint}
          </span>
        ) : null}
      </h2>
      {right}
    </div>
  )
}

export function Chip({
  tone,
  children,
}: {
  tone: 'green' | 'blue' | 'red' | 'amber' | 'gray'
  children: React.ReactNode
}) {
  const tones: Record<string, string> = {
    green: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950',
    blue: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950',
    red: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-950',
    amber: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950',
    gray: 'text-slate-400 dark:text-neutral-500',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Btn({
  children,
  onClick,
  tone = 'gray',
  disabled,
  busy,
  className = '',
}: {
  children: React.ReactNode
  onClick?: () => void
  tone?: 'gray' | 'blue' | 'red' | 'primary'
  disabled?: boolean
  busy?: boolean
  className?: string
}) {
  const tones: Record<string, string> = {
    gray: 'text-slate-500 dark:text-neutral-400 border border-slate-200 dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-800',
    blue: 'text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 hover:bg-blue-50 dark:hover:bg-blue-950',
    red: 'text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950 bg-white dark:bg-neutral-900',
    primary: 'text-white bg-blue-600 hover:bg-blue-700 border border-blue-600',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-1 text-xs font-medium rounded-md px-2.5 py-1 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${tones[tone]} ${className}`}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : children}
    </button>
  )
}

export function Progress({ percent, tone }: { percent: number; tone: 'green' | 'blue' }) {
  const bar = tone === 'green' ? 'bg-emerald-500' : 'bg-blue-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden min-w-16">
        <div className={`h-full ${bar} rounded-full`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-9 shrink-0">{percent}%</span>
    </div>
  )
}

export function Dot({ color }: { color: 'green' | 'red' | 'amber' }) {
  const map = { green: 'bg-emerald-500', red: 'bg-red-500', amber: 'bg-amber-500' }
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${map[color]}`} />
}
