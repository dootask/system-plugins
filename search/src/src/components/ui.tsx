/**
 * 极简 UI 原件（纯 Tailwind，明暗双主题）。
 */
import { useState } from 'react'

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 ${className}`}
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
    <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
      <h2 className="text-sm font-semibold">
        {title}
        {hint ? (
          <span className="text-xs font-normal text-slate-400 dark:text-slate-500 ml-2 hidden sm:inline">
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
    gray: 'text-slate-400 dark:text-slate-500',
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
    gray: 'text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
    blue: 'text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 hover:bg-blue-50 dark:hover:bg-blue-950',
    red: 'text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950 bg-white dark:bg-slate-900',
    primary: 'text-white bg-blue-600 hover:bg-blue-700 border border-blue-600',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`text-xs font-medium rounded-md px-2.5 py-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${tones[tone]} ${className}`}
    >
      {busy ? '…' : children}
    </button>
  )
}

export function Progress({ percent, tone }: { percent: number; tone: 'green' | 'blue' }) {
  const bar = tone === 'green' ? 'bg-emerald-500' : 'bg-blue-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden min-w-16">
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

/** 确认弹窗；requireWord 非空时要求输入确认词才能提交。 */
export function ConfirmModal({
  open,
  title,
  desc,
  requireWord,
  requireHint,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  desc: string
  requireWord?: string
  requireHint?: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const [word, setWord] = useState('')
  if (!open) return null
  const blocked = Boolean(requireWord) && word !== requireWord
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl max-w-sm w-full p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</div>
        {requireWord ? (
          <div className="space-y-1">
            <div className="text-xs text-slate-400">{requireHint}</div>
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-slate-700 bg-transparent rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              placeholder={requireWord}
            />
          </div>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Btn tone="gray" onClick={onClose}>
            {cancelLabel}
          </Btn>
          <Btn
            tone={danger ? 'red' : 'primary'}
            disabled={blocked}
            onClick={() => {
              setWord('')
              onConfirm()
            }}
          >
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  )
}
