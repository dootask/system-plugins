/**
 * 管理员鉴权：所有仪表盘接口的守门。
 *
 * 本插件的操作（清索引、重建）具有破坏性，不采用「信任前端传 user-id」的轻量模型：
 * 每个请求都必须带主程序签发的用户 token，服务端用 DooTask SDK 反查主程序验明身份，
 * 且要求 identity 含 admin。验证结果按 token 缓存 60 秒，避免高频轮询打爆主程序。
 *
 * token 来源（按序）：x-user-token 头（前端 fetch）→ token 头（doo app call / openapi
 * 调用自带）→ URL ?user_token=（iframe 首次加载）。
 */

interface VerifiedUser {
  userid: number
  nickname: string
  isAdmin: boolean
}

type DTClient = {
  getUserInfo: (noCache?: boolean) => Promise<{
    userid: number
    nickname?: string
    identity?: Array<string>
    [k: string]: unknown
  }>
}

const SERVER = process.env.DOOTASK_SERVER || 'http://nginx'
const CACHE_TTL_MS = 60_000
const cache = new Map<string, { user: VerifiedUser; exp: number }>()

function extractToken(request: Request): string {
  const headerToken =
    request.headers.get('x-user-token') || request.headers.get('token')
  if (headerToken) return headerToken.trim()
  try {
    return (new URL(request.url).searchParams.get('user_token') || '').trim()
  } catch {
    return ''
  }
}

async function verify(token: string): Promise<VerifiedUser | null> {
  const hit = cache.get(token)
  if (hit && hit.exp > Date.now()) return hit.user

  try {
    const mod = await import('@dootask/tools')
    const Ctor = (mod as unknown as { DooTaskClient: new (o: unknown) => DTClient })
      .DooTaskClient
    const client = new Ctor({ token, server: SERVER, timeoutMs: 8000 })
    const info = await client.getUserInfo()
    if (!info || !info.userid) return null
    const user: VerifiedUser = {
      userid: info.userid,
      nickname: info.nickname || '',
      isAdmin: Array.isArray(info.identity) && info.identity.includes('admin'),
    }
    // 缓存有界：避免被伪造 token 撑爆内存
    if (cache.size > 500) cache.clear()
    cache.set(token, { user, exp: Date.now() + CACHE_TTL_MS })
    return user
  } catch {
    return null
  }
}

/** 通过返回用户信息；未登录抛 401、非管理员抛 403（Response 直接向上抛给框架）。 */
export async function requireAdmin(request: Request): Promise<VerifiedUser> {
  const token = extractToken(request)
  if (!token) {
    throw Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const user = await verify(token)
  if (!user) {
    throw Response.json({ error: 'invalid token' }, { status: 401 })
  }
  if (!user.isAdmin) {
    throw Response.json({ error: 'admin only' }, { status: 403 })
  }
  return user
}

// ---- 响应助手 ----
export const ok = (data: unknown, init?: ResponseInit) =>
  Response.json({ data }, init)
export const badRequest = (error: string) =>
  Response.json({ error }, { status: 400 })

/** 包一层：鉴权 + 业务异常统一 500，requireAdmin 抛出的 Response 原样返回。 */
export function adminHandler(
  fn: (ctx: { request: Request; user: VerifiedUser }) => Promise<Response>,
): (ctx: { request: Request }) => Promise<Response> {
  return async ({ request }) => {
    try {
      const user = await requireAdmin(request)
      return await fn({ request, user })
    } catch (e) {
      if (e instanceof Response) return e
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[search-dashboard] api error:', msg)
      return Response.json({ error: msg }, { status: 500 })
    }
  }
}
