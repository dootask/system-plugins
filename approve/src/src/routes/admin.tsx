import { createFileRoute, Outlet } from '@tanstack/react-router'

// 审批管理布局：列表（admin.index）与模板设计器（admin.defs.$id）都渲染在这里的 Outlet。
// 之前 admin.tsx 直接把 TemplateList 当 component，没有 Outlet，导致进入 /admin/defs/$id
// 时子路由（新建/编辑器）无处渲染 → 点「新建/编辑」像没反应。
export const Route = createFileRoute('/admin')({ component: () => <Outlet /> })
