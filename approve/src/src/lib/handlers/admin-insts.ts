import {
  badRequest,
  forbidden,
  notFound,
  ok,
  readJson,
  requireUser,
} from '#/lib/auth'
import { createEngine, EngineError } from '#/lib/engine'
import { serverT } from '#/lib/i18n/server'
import { getInst, listAdminInsts } from '#/lib/repo/insts'
import { instSummary } from './insts'
import { idAfter, query } from './util'

export async function listAdminInstsHandler(
  request: Request,
): Promise<Response> {
  const t = serverT(request)
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  if (!auth.isAdmin) return forbidden(t('adminInst.adminOnly'))
  const positiveInt = (value: string | null, fallback: number) => {
    const n = Number(value)
    return Number.isSafeInteger(n) && n > 0 ? n : fallback
  }
  const result = listAdminInsts({
    keyword: (query(request, 'keyword') ?? '').trim(),
    status: query(request, 'status') ?? '',
    page: positiveInt(query(request, 'page'), 1),
    pageSize: Math.min(100, positiveInt(query(request, 'pageSize'), 20)),
  })
  return ok({ items: result.items.map(instSummary), total: result.total })
}

export async function voidInstHandler(request: Request): Promise<Response> {
  const t = serverT(request)
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  if (!auth.isAdmin) return forbidden(t('adminInst.adminOnly'))
  const id = idAfter(request, 'insts')
  if (!id || !getInst(id)) return notFound(t('server.err.instNotFound'))
  const body = await readJson<{ reason?: unknown }>(request)
  if (
    typeof body?.reason !== 'string' ||
    !body.reason.trim() ||
    body.reason.trim().length > 1000
  ) {
    return badRequest(t('engine.voidReasonRequired'))
  }
  try {
    createEngine().void(id, auth.userId, body.reason)
  } catch (e) {
    if (e instanceof EngineError) return badRequest(t(e.key, e.params))
    throw e
  }
  return ok({ ok: true })
}
