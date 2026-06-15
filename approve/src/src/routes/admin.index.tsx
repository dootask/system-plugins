import { createFileRoute } from '@tanstack/react-router'
import { TemplateList } from '#/components/views/template-list'

// 审批管理（模板列表）。/admin 入口；后端 API 亦做管理员鉴权。
export const Route = createFileRoute('/admin/')({ component: TemplateList })
