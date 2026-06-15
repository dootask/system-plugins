import { createFileRoute } from '@tanstack/react-router'
import {
  deleteDefHandler,
  getDefDetail,
  updateDefHandler,
} from '#/lib/handlers/defs'

// GET    /apps/approve/api/defs/:id → 模板详情（form_schema + flow_nodes）
// PUT    /apps/approve/api/defs/:id → 更新模板（管理员）
// DELETE /apps/approve/api/defs/:id → 删除模板（管理员）
export const Route = createFileRoute('/api/defs/$id')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => getDefDetail(request),
      PUT: ({ request }: { request: Request }) => updateDefHandler(request),
      DELETE: ({ request }: { request: Request }) => deleteDefHandler(request),
    },
  },
})
