import { createFileRoute, useParams } from '@tanstack/react-router'
import { TemplateEditor } from '#/components/views/template-editor'

// 模板设计器（新建 id='new' / 编辑 id=数字）：基本信息 + 表单设计 + 流程设计。
export const Route = createFileRoute('/admin/defs/$id')({
  component: EditorPage,
})

function EditorPage() {
  const { id } = useParams({ from: '/admin/defs/$id' })
  return <TemplateEditor idParam={id} />
}
