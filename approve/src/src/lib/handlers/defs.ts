import {
  badRequest,
  created,
  forbidden,
  notFound,
  ok,
  readJson,
  requireUser,
} from '#/lib/auth'
import {
  createDef,
  deleteDef,
  getDef,
  listDefs,
  updateDef,
} from '#/lib/repo/defs'
import { lastId, query } from './util'
import { validateFormSchema } from '#/lib/form/validate'
import { validateFlowTree } from '#/lib/engine/flow'
import { serverT } from '#/lib/i18n/server'
import type { TFunc } from '#/lib/i18n/translate'
import type { FormSchema } from '#/lib/form/types'
import type { FlowNode } from '#/lib/engine'

/** GET /api/defs/:id → 模板详情（form_schema + flow_nodes 预览）。 */
export async function getDefDetail(request: Request): Promise<Response> {
  const t = serverT(request)
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const id = lastId(request)
  if (!id) return notFound(t('server.err.missingDefId'))
  const d = getDef(id)
  if (!d) return notFound(t('server.err.defNotFound'))

  let formSchema: FormSchema = []
  let flowNodes: FlowNode | null = null
  try {
    formSchema = JSON.parse(d.form_schema || '[]') as FormSchema
  } catch {
    formSchema = []
  }
  try {
    flowNodes = JSON.parse(d.flow_nodes || 'null') as FlowNode | null
  } catch {
    flowNodes = null
  }

  return ok({
    id: d.id,
    name: d.name,
    category: d.category,
    icon: d.icon,
    version: d.version,
    status: d.status,
    sort_order: d.sort_order,
    form_schema: formSchema,
    flow_nodes: flowNodes,
  })
}

/**
 * GET /api/defs?all=1&page=&pageSize=&keyword=&status= → 管理端模板列表（含停用），仅管理员。
 * 返回 { items, total }（服务端分页/过滤：keyword 匹配名称，status 匹配 enabled/disabled）。
 */
export async function listAllDefsHandler(request: Request): Promise<Response> {
  const t = serverT(request)
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  if (!auth.isAdmin) return forbidden(t('server.err.adminOnlyTemplates'))
  const keyword = (query(request, 'keyword') ?? '').trim().toLowerCase()
  const status = query(request, 'status') ?? ''
  const page = Math.max(1, Number(query(request, 'page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query(request, 'pageSize')) || 20))

  let defs = listDefs()
  if (status) defs = defs.filter((d) => d.status === status)
  if (keyword) defs = defs.filter((d) => d.name.toLowerCase().includes(keyword))
  const total = defs.length
  const start = (page - 1) * pageSize
  const items = defs.slice(start, start + pageSize).map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    icon: d.icon,
    version: d.version,
    status: d.status,
    sort_order: d.sort_order,
    updated_at: d.updated_at,
  }))
  return ok({ items, total })
}

interface DefWriteBody {
  name?: string
  category?: string
  icon?: string | null
  form_schema?: FormSchema
  flow_nodes?: FlowNode | null
  status?: string
  sort_order?: number
}

/** 校验 + 序列化提交的 form_schema / flow_nodes，返回错误信息或 null。 */
function validatePayload(body: DefWriteBody, t: TFunc): string | null {
  if (body.form_schema !== undefined) {
    const e = validateFormSchema(body.form_schema, t)
    if (e) return e
  }
  if (body.flow_nodes !== undefined && body.flow_nodes !== null) {
    const e = validateFlowTree(body.flow_nodes, t)
    if (e) return e
  }
  return null
}

/** POST /api/defs → 新建模板（管理员）。 */
export async function createDefHandler(request: Request): Promise<Response> {
  const t = serverT(request)
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  if (!auth.isAdmin) return forbidden(t('server.err.adminOnlyTemplates'))
  const body = await readJson<DefWriteBody>(request)
  if (!body || !body.name?.trim()) return badRequest(t('server.err.missingDefName'))
  const err = validatePayload(body, t)
  if (err) return badRequest(err)

  const d = createDef(
    {
      name: body.name.trim(),
      category: body.category,
      icon: body.icon ?? null,
      form_schema: JSON.stringify(body.form_schema ?? []),
      flow_nodes: JSON.stringify(body.flow_nodes ?? null),
      status: body.status ?? 'enabled',
      sort_order: body.sort_order,
    },
    auth.userId,
  )
  return created({ id: d.id })
}

/** PUT /api/defs/:id → 更新模板（管理员）。改 form_schema / flow_nodes 时递增版本。 */
export async function updateDefHandler(request: Request): Promise<Response> {
  const t = serverT(request)
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  if (!auth.isAdmin) return forbidden(t('server.err.adminOnlyTemplates'))
  const id = lastId(request)
  if (!id) return notFound(t('server.err.missingDefId'))
  if (!getDef(id)) return notFound(t('server.err.defNotFound'))
  const body = await readJson<DefWriteBody>(request)
  if (!body) return badRequest(t('server.err.badBody'))
  const err = validatePayload(body, t)
  if (err) return badRequest(err)

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) {
    if (!body.name.trim()) return badRequest(t('server.err.emptyDefName'))
    patch.name = body.name.trim()
  }
  if (body.category !== undefined) patch.category = body.category
  if (body.icon !== undefined) patch.icon = body.icon
  if (body.status !== undefined) patch.status = body.status
  if (body.sort_order !== undefined) patch.sort_order = body.sort_order
  // 流程/表单结构变更需递增版本（运行中实例引用旧版快照，不受影响）。
  const structChanged =
    body.form_schema !== undefined || body.flow_nodes !== undefined
  if (body.form_schema !== undefined)
    patch.form_schema = JSON.stringify(body.form_schema)
  if (body.flow_nodes !== undefined)
    patch.flow_nodes = JSON.stringify(body.flow_nodes)

  updateDef(id, patch, { bumpVersion: structChanged })
  return ok({ id })
}

/** DELETE /api/defs/:id → 删除模板（管理员）。 */
export async function deleteDefHandler(request: Request): Promise<Response> {
  const t = serverT(request)
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  if (!auth.isAdmin) return forbidden(t('server.err.adminOnlyTemplates'))
  const id = lastId(request)
  if (!id) return notFound(t('server.err.missingDefId'))
  if (!deleteDef(id)) return notFound(t('server.err.defNotFound'))
  return ok({ id })
}
