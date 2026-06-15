import * as React from 'react'
import { Loader2, Plus, Trash2, Users } from 'lucide-react'
import { cn } from '#/lib/utils'
import { ApiError, uploadFile } from '#/lib/api'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { Label } from '#/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  DatePicker,
  DateRangePicker,
  DateTimePicker,
} from '#/components/ui/date-picker'
import { emptyTableRow } from '#/lib/form/validate'
import { pickUsers } from '#/lib/form/picker'
import { useUsers } from '#/lib/use-users'
import { UserAvatar } from '#/components/ui/user-chip'
import type {
  FieldDef,
  FieldOption,
  FileValue,
  FormErrors,
  FormSchema,
} from '#/lib/form/types'

// ────────────────────────────────────────────────────────────────────────
// 动态表单渲染器：按 FormSchema 渲染各字段类型。
// - value：受控表单值（key → 值）；onChange：整体回写新值对象。
// - readOnly：详情页/审批卡片只读展示。
// - errors：validateForm 产出的错误（key 同步，table 子字段用 `key[i].sub`）。
// 附件（file）选取后即经 /api/uploads 上传到主程序，回填 fileId。
// ────────────────────────────────────────────────────────────────────────

export interface FormRendererProps {
  schema: FormSchema
  value: Record<string, unknown>
  onChange?: (next: Record<string, unknown>) => void
  readOnly?: boolean
  errors?: FormErrors
  className?: string
}

export function FormRenderer({
  schema,
  value,
  onChange,
  readOnly = false,
  errors = {},
  className,
}: FormRendererProps) {
  const set = (key: string, v: unknown) => {
    if (readOnly || !onChange) return
    onChange({ ...value, [key]: v })
  }

  return (
    <div className={cn('space-y-4', className)}>
      {schema.map((field) => (
        <FieldRow
          key={field.key}
          field={field}
          value={value[field.key]}
          onChange={(v) => set(field.key, v)}
          readOnly={readOnly}
          errors={errors}
          errorKey={field.key}
        />
      ))}
    </div>
  )
}

interface FieldRowProps {
  field: FieldDef
  value: unknown
  onChange: (v: unknown) => void
  readOnly: boolean
  errors: FormErrors
  errorKey: string
}

function FieldRow({
  field,
  value,
  onChange,
  readOnly,
  errors,
  errorKey,
}: FieldRowProps) {
  if (field.type === 'desc') {
    return (
      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        {field.props?.text ?? field.label}
      </p>
    )
  }
  const err = errors[errorKey]
  return (
    <div className="space-y-1.5">
      <Label>
        {field.label}
        {field.required ? (
          <span className="ml-0.5 text-destructive">*</span>
        ) : null}
      </Label>
      <FieldControl
        field={field}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        errors={errors}
        errorKey={errorKey}
      />
      {field.hint ? (
        <p className="text-xs text-muted-foreground">{field.hint}</p>
      ) : null}
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
    </div>
  )
}

function FieldControl({
  field,
  value,
  onChange,
  readOnly,
  errors,
  errorKey,
}: FieldRowProps) {
  const ph = field.props?.placeholder

  switch (field.type) {
    case 'text':
      return (
        <Input
          value={(value as string | undefined) ?? ''}
          placeholder={ph}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'textarea':
      return (
        <Textarea
          value={(value as string | undefined) ?? ''}
          placeholder={ph}
          rows={field.props?.rows}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'number':
    case 'money':
      return (
        <div className="relative">
          {field.type === 'money' ? (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {field.props?.currency ?? '¥'}
            </span>
          ) : null}
          <Input
            type="number"
            className={field.type === 'money' ? 'pl-7' : undefined}
            value={(value as number | string | undefined) ?? ''}
            placeholder={ph}
            step={field.props?.step}
            disabled={readOnly}
            onChange={(e) =>
              onChange(e.target.value === '' ? '' : Number(e.target.value))
            }
          />
        </div>
      )
    case 'date':
      return (
        <DatePicker
          value={(value as string | undefined) ?? ''}
          disabled={readOnly}
          placeholder={ph}
          onChange={(v) => onChange(v)}
        />
      )
    case 'datetime':
      return (
        <DateTimePicker
          value={(value as string | undefined) ?? ''}
          disabled={readOnly}
          placeholder={ph}
          onChange={(v) => onChange(v)}
        />
      )
    case 'daterange':
      return (
        <DateRangePicker
          value={Array.isArray(value) ? (value as Array<string>) : ['', '']}
          disabled={readOnly}
          placeholder={ph}
          onChange={(v) => onChange(v)}
        />
      )
    case 'select': {
      const opts = field.options ?? []
      const cur =
        value === undefined || value === null || value === ''
          ? SELECT_NONE
          : String(value)
      return (
        <Select
          value={cur}
          disabled={readOnly}
          onValueChange={(v) =>
            onChange(v === SELECT_NONE ? '' : coerceOption(opts, v))
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={ph ?? '请选择'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_NONE}>{ph ?? '请选择'}</SelectItem>
            {opts.map((o) => (
              <SelectItem key={String(o.value)} value={String(o.value)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    case 'multiselect':
      return (
        <MultiSelectField
          options={field.options ?? []}
          value={Array.isArray(value) ? (value as Array<string | number>) : []}
          readOnly={readOnly}
          onChange={onChange}
        />
      )
    case 'user':
    case 'dept':
      return (
        <UserField
          kind={field.type}
          value={Array.isArray(value) ? (value as Array<number>) : []}
          multiple={field.props?.multiple !== false}
          readOnly={readOnly}
          onChange={onChange}
        />
      )
    case 'file':
      return (
        <FileField
          value={Array.isArray(value) ? (value as Array<FileValue>) : []}
          readOnly={readOnly}
          onChange={onChange}
        />
      )
    case 'table':
      return (
        <TableField
          field={field}
          value={
            Array.isArray(value)
              ? (value as Array<Record<string, unknown>>)
              : []
          }
          readOnly={readOnly}
          onChange={onChange}
          errors={errors}
          errorKey={errorKey}
        />
      )
    default:
      return null
  }
}

// Radix Select 的 value 不能是空串，用哨兵代表「未选/请选择」。
const SELECT_NONE = '__none__'

/** 把 select 的 string 值还原成 option 原始类型（数字保数字）。 */
function coerceOption(opts: Array<FieldOption>, raw: string): unknown {
  if (raw === '') return ''
  const hit = opts.find((o) => String(o.value) === raw)
  return hit ? hit.value : raw
}

// ───────────────────────── 多选 ─────────────────────────
function MultiSelectField({
  options,
  value,
  readOnly,
  onChange,
}: {
  options: Array<FieldOption>
  value: Array<string | number>
  readOnly: boolean
  onChange: (v: Array<string | number>) => void
}) {
  const toggle = (v: string | number) => {
    if (readOnly) return
    const has = value.some((x) => String(x) === String(v))
    onChange(has ? value.filter((x) => String(x) !== String(v)) : [...value, v])
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value.some((x) => String(x) === String(o.value))
        return (
          <button
            key={String(o.value)}
            type="button"
            disabled={readOnly}
            onClick={() => toggle(o.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-60',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background hover:bg-accent',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ───────────────────────── 人员/部门 ─────────────────────────
function UserField({
  kind,
  value,
  multiple,
  readOnly,
  onChange,
}: {
  kind: 'user' | 'dept'
  value: Array<number>
  multiple: boolean
  readOnly: boolean
  onChange: (v: Array<number>) => void
}) {
  // 人员展示头像+昵称；部门暂无名称解析接口，回退展示 id。
  const userOf = useUsers(kind === 'user' ? value : [])
  const open = async () => {
    if (readOnly) return
    const r = await pickUsers({ value, multiple })
    if (r.status === 'picked') onChange(r.ids)
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((id) => (
        <span
          key={id}
          className="inline-flex items-center gap-1.5 rounded-md bg-secondary py-1 pr-2 pl-1 text-xs text-secondary-foreground"
        >
          {kind === 'user' ? (
            <UserAvatar user={userOf(id)} size="sm" className="size-5" />
          ) : (
            <Users className="ml-1 size-3" />
          )}
          <span className="max-w-32 truncate">
            {kind === 'user' ? userOf(id).nickname : id}
          </span>
          {!readOnly ? (
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== id))}
              className="text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
      {!readOnly ? (
        <Button variant="outline" size="sm" onClick={open}>
          <Users className="size-3" /> 选择
        </Button>
      ) : value.length === 0 ? (
        <span className="text-sm text-muted-foreground">—</span>
      ) : null}
    </div>
  )
}

// ───────────────────────── 附件（选取即上传到主程序） ─────────────────────────
function FileField({
  value,
  readOnly,
  onChange,
}: {
  value: Array<FileValue>
  readOnly: boolean
  onChange: (v: Array<FileValue>) => void
}) {
  const [uploading, setUploading] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  // 用 ref 持有最新值，避免并发上传时基于过期闭包覆盖彼此结果。
  const valueRef = React.useRef(value)
  valueRef.current = value

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setError(null)
    setUploading((n) => n + files.length)
    for (const f of files) {
      try {
        const up = await uploadFile(f)
        onChange([
          ...valueRef.current,
          { fileId: up.fileId, name: up.name, size: up.size, ext: up.ext },
        ])
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : `「${f.name}」上传失败`,
        )
      } finally {
        setUploading((n) => Math.max(0, n - 1))
      }
    }
  }

  return (
    <div className="space-y-2">
      {value.map((f, i) => (
        <div
          key={`${f.fileId ?? f.name}-${i}`}
          className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"
        >
          <span className="truncate">{f.name}</span>
          {!readOnly ? (
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>
      ))}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {!readOnly ? (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-accent">
          {uploading > 0 ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          {uploading > 0 ? `上传中…（${uploading}）` : '添加附件'}
          <input type="file" multiple className="hidden" onChange={onPick} />
        </label>
      ) : value.length === 0 ? (
        <span className="text-sm text-muted-foreground">无附件</span>
      ) : null}
    </div>
  )
}

// ───────────────────────── 明细子表（可增删行） ─────────────────────────
function TableField({
  field,
  value,
  readOnly,
  onChange,
  errors,
  errorKey,
}: {
  field: FieldDef
  value: Array<Record<string, unknown>>
  readOnly: boolean
  onChange: (v: Array<Record<string, unknown>>) => void
  errors: FormErrors
  errorKey: string
}) {
  const cols = (field.columns ?? []).filter((c) => c.type !== 'desc')
  const addRow = () => onChange([...value, emptyTableRow(cols)])
  const delRow = (i: number) => onChange(value.filter((_, j) => j !== i))
  const setCell = (i: number, key: string, v: unknown) => {
    const next = value.map((row, j) => (j === i ? { ...row, [key]: v } : row))
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {cols.map((c) => (
                <th key={c.key} className="px-3 py-2 text-left font-medium">
                  {c.label}
                  {c.required ? (
                    <span className="ml-0.5 text-destructive">*</span>
                  ) : null}
                </th>
              ))}
              {!readOnly ? <th className="w-10" /> : null}
            </tr>
          </thead>
          <tbody>
            {value.length === 0 ? (
              <tr>
                <td
                  colSpan={cols.length + (readOnly ? 0 : 1)}
                  className="px-3 py-3 text-center text-muted-foreground"
                >
                  暂无明细
                </td>
              </tr>
            ) : null}
            {value.map((row, i) => (
              <tr key={i} className="border-t align-top">
                {cols.map((c) => (
                  <td key={c.key} className="px-2 py-1.5">
                    <FieldControl
                      field={c}
                      value={row[c.key]}
                      onChange={(v) => setCell(i, c.key, v)}
                      readOnly={readOnly}
                      errors={errors}
                      errorKey={`${errorKey}[${i}].${c.key}`}
                    />
                    {errors[`${errorKey}[${i}].${c.key}`] ? (
                      <p className="mt-0.5 text-xs text-destructive">
                        {errors[`${errorKey}[${i}].${c.key}`]}
                      </p>
                    ) : null}
                  </td>
                ))}
                {!readOnly ? (
                  <td className="px-2 py-1.5 align-middle">
                    <button
                      type="button"
                      onClick={() => delRow(i)}
                      className="flex w-full items-center justify-center text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly ? (
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="size-4" /> 增加一行
        </Button>
      ) : null}
    </div>
  )
}
