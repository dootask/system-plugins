import { createFileRoute } from '@tanstack/react-router'

// 「抄送我」列表在常驻视图 components/views/inst-list.tsx（保活）渲染，此路由仅占位。
export const Route = createFileRoute('/cc')({ component: () => null })
