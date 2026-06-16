import * as React from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { FormRenderer } from '#/components/form/FormRenderer'
import { initialFormValue } from '#/lib/form'
import {
  FIELD_TYPES,
  TABLE_COLUMN_TYPES,
  collectFieldKeys,
  makeField,
} from '#/lib/designer/utils'
import { useT } from '#/lib/i18n/context'
import type { TFunc } from '#/lib/i18n/translate'
import type {
  FieldDef,
  FieldOption,
  FieldType,
  FormSchema,
} from '#/lib/form/types'

// ────────────────────────────────────────────────────────────────────────
// 表单设计器：可视化增删改/排序字段（13 种类型），配 label/required/options/
// 子表 columns/校验规则 → 产出 FormSchema。右侧实时预览复用 FormRenderer。
// ────────────────────────────────────────────────────────────────────────

export function FormDesigner({
  value,
  onChange,
}: {
  value: FormSchema
  onChange: (next: FormSchema) => void
}) {
  const t = useT()
  const [previewValue, setPreviewValue] = React.useState<
    Record<string, unknown>
  >({})
  // schema 变化时重置预览值（字段可能增删）。
  React.useEffect(() => {
    setPreviewValue(initialFormValue(value))
  }, [value])

  const addField = (type: FieldType) => {
    onChange([...value, makeField(type, collectFieldKeys(value), t)])
  }
  const patchField = (i: number, patch: Partial<FieldDef>) => {
    onChange(value.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  }
  const delField = (i: number) => onChange(value.filter((_, j) => j !== i))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= value.length) return
    const next = [...value]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-muted-foreground">
            {t('designer.form.addField')}
          </span>
          {FIELD_TYPES.map((m) => (
            <button
              key={m.type}
              type="button"
              onClick={() => addField(m.type)}
              className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
            >
              {t(m.labelKey)}
            </button>
          ))}
        </div>

        {value.length === 0 ? (
          <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            {t('designer.form.clickToAdd')}
          </p>
        ) : (
          <div className="space-y-2">
            {value.map((field, i) => (
              <FieldEditor
                key={field.key}
                t={t}
                field={field}
                isFirst={i === 0}
                isLast={i === value.length - 1}
                onChange={(p) => patchField(i, p)}
                onDelete={() => delField(i)}
                onMoveUp={() => move(i, -1)}
                onMoveDown={() => move(i, 1)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground">
          {t('designer.form.livePreview')}
        </Label>
        <div className="rounded-lg border bg-card p-4">
          {value.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('designer.form.noFields')}
            </p>
          ) : (
            <FormRenderer
              schema={value}
              value={previewValue}
              onChange={setPreviewValue}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function FieldEditor({
  t,
  field,
  isFirst,
  isLast,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  t: TFunc
  field: FieldDef
  isFirst: boolean
  isLast: boolean
  onChange: (patch: Partial<FieldDef>) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const typeMeta = FIELD_TYPES.find((m) => m.type === field.type)

  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {typeMeta ? t(typeMeta.labelKey) : null}
        </span>
        <span className="flex-1 truncate text-sm font-medium">
          {field.label || field.key}
          {field.required ? (
            <span className="ml-0.5 text-destructive">*</span>
          ) : null}
        </span>
        <button
          type="button"
          disabled={isFirst}
          onClick={onMoveUp}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={onMoveDown}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ChevronDown className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs text-primary hover:underline"
        >
          {open ? t('designer.form.collapse') : t('designer.form.configure')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {open ? (
        <div className="space-y-3 border-t bg-muted/30 px-3 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('designer.form.label')}</Label>
              <Input
                value={field.label}
                onChange={(e) => onChange({ label: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('designer.form.fieldKey')}</Label>
              <Input
                value={field.key}
                onChange={(e) => onChange({ key: e.target.value })}
              />
            </div>
          </div>

          {field.type !== 'desc' ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!field.required}
                onChange={(e) => onChange({ required: e.target.checked })}
              />
              {t('designer.form.required')}
            </label>
          ) : null}

          {field.type === 'desc' ? (
            <div className="space-y-1">
              <Label className="text-xs">{t('designer.form.descText')}</Label>
              <Input
                value={field.props?.text ?? ''}
                onChange={(e) =>
                  onChange({ props: { ...field.props, text: e.target.value } })
                }
              />
            </div>
          ) : null}

          {typeMeta?.hasOptions ? (
            <OptionsEditor
              t={t}
              options={field.options ?? []}
              onChange={(options) => onChange({ options })}
            />
          ) : null}

          {field.type === 'table' ? (
            <ColumnsEditor
              t={t}
              columns={field.columns ?? []}
              onChange={(columns) => onChange({ columns })}
            />
          ) : null}

          <RulesEditor t={t} field={field} onChange={onChange} />

          <div className="space-y-1">
            <Label className="text-xs">{t('designer.form.helpText')}</Label>
            <Input
              value={field.hint ?? ''}
              onChange={(e) => onChange({ hint: e.target.value || undefined })}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function OptionsEditor({
  t,
  options,
  onChange,
}: {
  t: TFunc
  options: Array<FieldOption>
  onChange: (opts: Array<FieldOption>) => void
}) {
  const patch = (i: number, p: Partial<FieldOption>) =>
    onChange(options.map((o, j) => (j === i ? { ...o, ...p } : o)))
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{t('designer.form.options')}</Label>
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            className="h-8"
            placeholder={t('designer.form.optionLabelPlaceholder')}
            value={o.label}
            onChange={(e) => patch(i, { label: e.target.value })}
          />
          <Input
            className="h-8"
            placeholder={t('designer.form.optionValuePlaceholder')}
            value={String(o.value)}
            onChange={(e) => patch(i, { value: e.target.value })}
          />
          <button
            type="button"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([
            ...options,
            {
              label: t('designer.default.option', { n: options.length + 1 }),
              value: `opt${options.length + 1}`,
            },
          ])
        }
      >
        <Plus className="size-3" /> {t('designer.form.addOption')}
      </Button>
    </div>
  )
}

function ColumnsEditor({
  t,
  columns,
  onChange,
}: {
  t: TFunc
  columns: Array<FieldDef>
  onChange: (cols: Array<FieldDef>) => void
}) {
  const patch = (i: number, p: Partial<FieldDef>) =>
    onChange(columns.map((c, j) => (j === i ? { ...c, ...p } : c)))
  const addCol = () => {
    const keys = new Set(columns.map((c) => c.key))
    let n = columns.length + 1
    let key = `col_${n}`
    while (keys.has(key)) key = `col_${++n}`
    onChange([
      ...columns,
      {
        key,
        type: 'text',
        label: t('designer.default.column', { n: columns.length + 1 }),
      },
    ])
  }
  return (
    <div className="space-y-1.5 rounded-md border border-dashed p-2">
      <Label className="text-xs">{t('designer.form.subtableColumns')}</Label>
      {columns.map((c, i) => (
        <div key={i} className="space-y-2 rounded-md border bg-background p-2">
          <div className="flex items-center gap-2">
            <Input
              className="h-8 min-w-0 flex-1"
              placeholder={t('designer.form.columnNamePlaceholder')}
              value={c.label}
              onChange={(e) => patch(i, { label: e.target.value })}
            />
            <button
              type="button"
              onClick={() => onChange(columns.filter((_, j) => j !== i))}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-8 w-28"
              placeholder="key"
              value={c.key}
              onChange={(e) => patch(i, { key: e.target.value })}
            />
            <Select
              value={c.type}
              onValueChange={(v) => patch(i, { type: v as FieldType })}
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TABLE_COLUMN_TYPES.map((m) => (
                  <SelectItem key={m.type} value={m.type}>
                    {t(m.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={!!c.required}
                onChange={(e) => patch(i, { required: e.target.checked })}
              />
              {t('designer.form.required')}
            </label>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addCol}>
        <Plus className="size-3" /> {t('designer.form.addColumn')}
      </Button>
    </div>
  )
}

function RulesEditor({
  t,
  field,
  onChange,
}: {
  t: TFunc
  field: FieldDef
  onChange: (patch: Partial<FieldDef>) => void
}) {
  const r = field.rules ?? {}
  const setRule = (key: string, v: number | undefined) =>
    onChange({ rules: { ...r, [key]: v } })
  const numInput = (
    key: 'min' | 'max' | 'minLength' | 'maxLength' | 'minItems' | 'maxItems',
    label: string,
  ) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        className="h-8"
        type="number"
        value={r[key] ?? ''}
        onChange={(e) =>
          setRule(
            key,
            e.target.value === '' ? undefined : Number(e.target.value),
          )
        }
      />
    </div>
  )
  const isNum = field.type === 'number' || field.type === 'money'
  const isText = field.type === 'text' || field.type === 'textarea'
  const isMulti =
    field.type === 'multiselect' ||
    field.type === 'user' ||
    field.type === 'dept' ||
    field.type === 'file'
  if (!isNum && !isText && !isMulti) return null
  return (
    <div className="grid grid-cols-2 gap-3">
      {isNum ? (
        <>
          {numInput('min', t('designer.form.ruleMin'))}
          {numInput('max', t('designer.form.ruleMax'))}
        </>
      ) : null}
      {isText ? (
        <>
          {numInput('minLength', t('designer.form.ruleMinLength'))}
          {numInput('maxLength', t('designer.form.ruleMaxLength'))}
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">{t('designer.form.rulePattern')}</Label>
            <Input
              className="h-8"
              value={r.pattern ?? ''}
              onChange={(e) =>
                onChange({
                  rules: { ...r, pattern: e.target.value || undefined },
                })
              }
            />
          </div>
        </>
      ) : null}
      {isMulti ? (
        <>
          {numInput('minItems', t('designer.form.ruleMinItems'))}
          {numInput('maxItems', t('designer.form.ruleMaxItems'))}
        </>
      ) : null}
    </div>
  )
}
