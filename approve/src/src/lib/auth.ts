import { verifyUserToken } from '#/lib/dootask-server'
import type { AuthUser } from '#/lib/types'

function adminIds(): Array<number> {
  return (process.env.APPROVE_ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n))
}

// 反查结果缓存：同一 token 在短时间内复用，避免每个请求都打主程序。
const TOKEN_TTL_MS = 60_000
const tokenCache = new Map<
  string,
  { user: { userid: number; nickname: string; email?: string }; at: number }
>()

/**
 * 服务端鉴权辅助（比 crm 多一步加固）。
 *
 * 不信任前端自报的 x-user-id；改为从 `x-user-token` 取凭据，用它构造 DooTaskClient
 * 调主程序 getUserInfo **反查真实身份**，再据此判定管理员。
 *
 * @returns 成功 → AuthUser；失败 → 一个 401 Response（调用方直接 return 即可）。
 *
 * 用法：
 *   const auth = await requireUser(request)
 *   if (auth instanceof Response) return auth
 *   // 此后 auth 为可信的 AuthUser
 */
export async function requireUser(
  request: Request,
): Promise<AuthUser | Response> {
  const token = request.headers.get('x-user-token')
  if (!token) return unauthorized('缺少用户凭据')

  let basic = readCache(token)
  if (!basic) {
    const verified = await verifyUserToken(token)
    if (!verified) return unauthorized('凭据无效或已过期')
    basic = verified
    tokenCache.set(token, { user: verified, at: Date.now() })
  }

  const admins = adminIds()
  // 未配置管理员时按「无人是管理员」处理；配置后仅名单内为管理员。
  const isAdmin = admins.includes(basic.userid)
  return {
    userId: basic.userid,
    nickname: basic.nickname,
    email: basic.email,
    isAdmin,
  }
}

function readCache(token: string) {
  const hit = tokenCache.get(token)
  if (!hit) return null
  if (Date.now() - hit.at > TOKEN_TTL_MS) {
    tokenCache.delete(token)
    return null
  }
  return hit.user
}

// ---- 响应助手 ----
export const ok = (data: unknown, init?: ResponseInit) =>
  Response.json({ data }, init)
export const created = (data: unknown) =>
  Response.json({ data }, { status: 201 })
export const badRequest = (error: string) =>
  Response.json({ error }, { status: 400 })
export const unauthorized = (error = 'unauthorized') =>
  Response.json({ error }, { status: 401 })
export const forbidden = (error = 'forbidden') =>
  Response.json({ error }, { status: 403 })
export const notFound = (error = 'not found') =>
  Response.json({ error }, { status: 404 })

/** 安全解析 JSON body，失败返回 null。 */
export async function readJson<T = Record<string, unknown>>(
  request: Request,
): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}
