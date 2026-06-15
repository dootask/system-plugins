// 前端 API 封装：统一前缀 /apps/approve/api，自动带上 DooTask 用户身份头。
// auth 由 useDooTask 在握手成功后通过 setAuth 写入。
//
// 注意：服务端不信任 x-user-id，而是用 x-user-token 反查主程序确认身份
// （见 lib/auth.ts requireUser）。x-user-id 仅作为辅助/调试信息透传。

const API_BASE = '/apps/approve/api'

let _auth: { userId: number | null; token: string | null } = {
  userId: null,
  token: null,
}

// 鉴权就绪门闩：useDooTask 完成与主程序握手后才调用 setAuth 写入身份头。
// 在此之前所有 api()/uploadFile() 都先 await，避免首屏视图早于握手发请求导致
// 401「缺少用户凭据」（之前需切换路由再回来才好就是这个竞态）。
let _ready = false
let _resolveReady!: () => void
const _authReady = new Promise<void>((resolve) => {
  _resolveReady = resolve
})

export function setAuth(auth: { userId: number | null; token: string | null }) {
  _auth = auth
  if (!_ready) {
    _ready = true
    _resolveReady()
  }
}

export function getAuthUserId(): number | null {
  return _auth.userId
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  if (_auth.userId != null) h['x-user-id'] = String(_auth.userId)
  if (_auth.token) h['x-user-token'] = _auth.token
  return h
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** 发起请求，自动解析 { data } / { error }。GET 用 api(path)；写操作传 method+json。 */
export async function api<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  let body = init?.body
  const extra: Record<string, string> = {}
  if (init?.json !== undefined) {
    extra['content-type'] = 'application/json'
    body = JSON.stringify(init.json)
  }
  // 等握手就绪，再读取 authHeaders（此时 setAuth 已写入身份头）。
  await _authReady
  const headers: Record<string, string> = {
    ...authHeaders(),
    ...extra,
    ...(init?.headers as Record<string, string> | undefined),
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, body })
  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    /* 无 body */
  }
  if (!res.ok) {
    const msg =
      (payload as { error?: string } | null)?.error ||
      `请求失败 (${res.status})`
    throw new ApiError(msg, res.status)
  }
  return (payload as { data?: T } | null)?.data as T
}

/** 上传单个文件到主程序（经 /api/uploads），返回 { fileId, name, size, ext }。 */
export async function uploadFile(file: File): Promise<{
  fileId: number
  name: string
  size?: number
  ext?: string
}> {
  const fd = new FormData()
  fd.append('file', file)
  await _authReady
  // 注意：multipart 不要手动设 content-type，让浏览器带上 boundary。
  const res = await fetch(`${API_BASE}/uploads`, {
    method: 'POST',
    headers: authHeaders(),
    body: fd,
  })
  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    /* 无 body */
  }
  if (!res.ok) {
    const msg =
      (payload as { error?: string } | null)?.error ||
      `上传失败 (${res.status})`
    throw new ApiError(msg, res.status)
  }
  return (
    payload as {
      data: { fileId: number; name: string; size?: number; ext?: string }
    }
  ).data
}
