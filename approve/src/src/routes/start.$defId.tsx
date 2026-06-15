import { createFileRoute, useParams } from '@tanstack/react-router'
import { StartForm } from '#/components/views/start-form'

// 发起页：模板已在落地宫格选定，按 defId 渲染动态表单 → 提交。
// from：来源路径（缺省回发起宫格 /）。
export const Route = createFileRoute('/start/$defId')({
  validateSearch: (s: Record<string, unknown>): { from?: string } => ({
    from: typeof s.from === 'string' ? s.from : undefined,
  }),
  component: StartFormPage,
})

function StartFormPage() {
  const { defId } = useParams({ from: '/start/$defId' })
  const { from } = Route.useSearch()
  return <StartForm defId={Number(defId)} backTo={from} />
}
