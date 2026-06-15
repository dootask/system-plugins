import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { api, ApiError } from '#/lib/api'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { EmojiPicker } from '#/components/ui/emoji-picker'
import { cn } from '#/lib/utils'
import { ErrorBar, Loading, PageHeader } from '#/components/ui/misc'
import { FormDesigner } from '#/components/designer/FormDesigner'
import { FlowDesigner } from '#/components/designer/FlowDesigner'
import { validateFormSchema } from '#/lib/form/validate'
// 直接从纯模块 engine/flow 引入：经 engine 桶文件会牵入 engine.ts→lib/db（node:fs），
// 把服务端专用代码打进客户端 bundle，渲染设计器时报 "o is not a function"。
import { validateFlowTree } from '#/lib/engine/flow'
import { makeStart } from '#/lib/designer/utils'
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
  const navigate = useNavigate()
  const isNew = idParam === 'new'
  const id = isNew ? null : Number(idParam)

  const [tab, setTab] = useState<Tab>('basic')
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const [category, setCategory] = useState('custom')
  const [schema, setSchema] = useState<FormSchema>([])
  const [flow, setFlow] = useState<FlowNode>(() => makeStart())
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
        setFlow(d.flow_nodes ?? makeStart())
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [id, isNew])

  const save = async () => {
    if (!name.trim()) {
      setError('请填写模板名称')
      setTab('basic')
      return
    }
    const fe = validateFormSchema(schema)
    if (fe) {
      setError(fe)
      setTab('form')
      return
    }
    const ne = validateFlowTree(flow)
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
      setError(e instanceof ApiError ? e.message : '保存失败')
      setSaving(false)
    }
  }

  if (loading) return <Loading center />

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'basic', label: '基本信息' },
    { key: 'form', label: '表单设计' },
    { key: 'flow', label: '流程设计' },
  ]

  return (
    <div>
      <PageHeader
        title={isNew ? '新建模板' : '编辑模板'}
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate({ to: '/admin' })}
              disabled={saving}
            >
              取消
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        }
      />
      {error ? <ErrorBar message={error} /> : null}

      <div className="mb-4 flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'basic' ? (
        <div className="max-w-md space-y-4">
          <div className="space-y-1.5">
            <Label>模板名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>图标（emoji，可选）</Label>
            <div>
              <EmojiPicker value={icon} onChange={setIcon} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>分类</Label>
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
    </div>
  )
}
