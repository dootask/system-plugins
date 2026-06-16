import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { api, ApiError } from '#/lib/api'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { EmojiPicker } from '#/components/ui/emoji-picker'
import { cn } from '#/lib/utils'
import { ErrorBar, Loading, SubPageBreadcrumb } from '#/components/ui/misc'
import { FormDesigner } from '#/components/designer/FormDesigner'
import { FlowDesigner } from '#/components/designer/FlowDesigner'
import { validateFormSchema } from '#/lib/form/validate'
// 直接从纯模块 engine/flow 引入：经 engine 桶文件会牵入 engine.ts→lib/db（node:fs），
// 把服务端专用代码打进客户端 bundle，渲染设计器时报 "o is not a function"。
import { validateFlowTree } from '#/lib/engine/flow'
import { makeStart } from '#/lib/designer/utils'
import { useT } from '#/lib/i18n/context'
import type { FormSchema } from '#/lib/form/types'
import type { FlowNode } from '#/lib/engine/flow'

interface DefDetail {
  id: number
  name: string
  category: string
  icon: string | null
  status: string
  form_schema?: FormSchema
  flow_nodes?: FlowNode | null
}

type Tab = 'basic' | 'form' | 'flow'

export function TemplateEditor({ idParam }: { idParam: string }) {
  const t = useT()
  const navigate = useNavigate()
  const isNew = idParam === 'new'
  const id = isNew ? null : Number(idParam)

  const [tab, setTab] = useState<Tab>('basic')
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const [category, setCategory] = useState('custom')
  const [schema, setSchema] = useState<FormSchema>([])
  const [flow, setFlow] = useState<FlowNode>(() => makeStart(t))
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNew) return
    setLoading(true)
    api<DefDetail>(`/defs/${id}`)
      .then((d) => {
        setName(d.name)
        setIcon(d.icon ?? '')
        setCategory(d.category)
        setSchema(d.form_schema ?? [])
        setFlow(d.flow_nodes ?? makeStart(t))
      })
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : t('designer.tpl.loadFailed'),
        ),
      )
      .finally(() => setLoading(false))
  }, [id, isNew])

  const save = async () => {
    if (!name.trim()) {
      setError(t('designer.tpl.nameRequired'))
      setTab('basic')
      return
    }
    const fe = validateFormSchema(schema, t)
    if (fe) {
      setError(fe)
      setTab('form')
      return
    }
    const ne = validateFlowTree(flow, t)
    if (ne) {
      setError(ne)
      setTab('flow')
      return
    }
    setError(null)
    setSaving(true)
    const body = {
      name: name.trim(),
      icon: icon.trim() || null,
      category,
      form_schema: schema,
      flow_nodes: flow,
    }
    try {
      if (isNew) {
        await api('/defs', { method: 'POST', json: body })
      } else {
        await api(`/defs/${id}`, { method: 'PUT', json: body })
      }
      navigate({ to: '/admin' })
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : t('designer.tpl.saveFailed'),
      )
      setSaving(false)
    }
  }

  if (loading) return <Loading center />

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'basic', label: t('designer.tpl.tabBasic') },
    { key: 'form', label: t('designer.tpl.tabForm') },
    { key: 'flow', label: t('designer.tpl.tabFlow') },
  ]

  return (
    <div className="space-y-4">
      <SubPageBreadcrumb
        parent="/admin"
        current={
          isNew ? t('designer.tpl.newTemplate') : t('designer.tpl.editTemplate')
        }
      />
      {error ? <ErrorBar message={error} /> : null}

      {/* 页签（操作按钮已移到底部浮动操作栏） */}
      <div className="flex min-w-0 gap-1 overflow-x-auto border-b">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={cn(
              'shrink-0 border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              tab === tb.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'basic' ? (
        <div className="max-w-md space-y-4">
          <div className="space-y-1.5">
            <Label>{t('designer.tpl.templateName')}</Label>
            {/* 图标（emoji）放输入框前面，与名称合并成一行 */}
            <div className="flex items-center gap-2">
              <EmojiPicker value={icon} onChange={setIcon} />
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('designer.tpl.category')}</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {tab === 'form' ? (
        <FormDesigner value={schema} onChange={setSchema} />
      ) : null}

      {tab === 'flow' ? (
        <FlowDesigner value={flow} schema={schema} onChange={setFlow} />
      ) : null}

      {/* 底部操作栏：与发起申请一致，置于内容底部（不浮动） */}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => navigate({ to: '/admin' })}
          disabled={saving}
        >
          {t('common.cancel')}
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? t('designer.tpl.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  )
}
