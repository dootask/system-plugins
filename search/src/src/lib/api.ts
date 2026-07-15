/**
 * 前端 API 客户端：统一带上用户 token（服务端逐请求向主程序验明管理员身份）。
 * token 优先取 @dootask/tools 握手结果，握手前用菜单 url 的 ?user_token= 兜底，
 * 保证首屏第一次 /api/status 就能通过鉴权。
 */

let userToken: string | null = null

export function setUserToken(token: string | null) {
  if (token) userToken = token
}

export function tokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('user_token')
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const BASE = '/apps/search/api'

export async function api<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const token = userToken || tokenFromUrl() || ''
  const headers: Record<string, string> = {
    'x-user-token': token,
    ...(init?.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
  }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  })
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: string }
  if (!res.ok) throw new ApiError(res.status, body.error || `HTTP ${res.status}`)
  return body.data as T
}
