import { createFileRoute, useParams } from '@tanstack/react-router'
import { useT } from '#/lib/i18n/context'
import { InstDetailView } from '#/components/detail/inst-detail'

// 详情页：表单只读展示 + 流程时间线 + 参与人 + 操作条 + 评论。
// from：来源列表路径（如 /todo），返回时回到它（缺省回 /）。
export const Route = createFileRoute('/insts/$id')({
  validateSearch: (s: Record<string, unknown>): { from?: string } => ({
    from: typeof s.from === 'string' ? s.from : undefined,
  }),
  component: InstDetailPage,
})

function InstDetailPage() {
  const t = useT()
  const { id } = useParams({ from: '/insts/$id' })
  const { from } = Route.useSearch()
  const instId = Number(id)
  if (!Number.isFinite(instId) || instId <= 0) {
    return <p className="text-sm text-destructive">{t('detail.invalidId')}</p>
  }
  return <InstDetailView instId={instId} backTo={from} />
}
