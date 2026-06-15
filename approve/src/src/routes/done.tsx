import { createFileRoute } from '@tanstack/react-router'

// 「已处理」列表在常驻视图 components/views/inst-list.tsx（保活）渲染，此路由仅占位。
export const Route = createFileRoute('/done')({ component: () => null })
