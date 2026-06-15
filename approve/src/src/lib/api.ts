// 前端 API 封装：统一前缀 /apps/approve/api，自动带上 DooTask 用户身份头。
// auth 由 useDooTask 在握手成功后通过 setAuth 写入。
//
// 注意：服务端不信任 x-user-id，而是用 x-user-token 反查主程序确认身份
// （见 lib/auth.ts requireUser）。x-user-id 仅作为辅助/调试信息透传。
import type { Attachment } from '#/lib/types'

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

/**
 * 鉴权下载：带身份头取文件流并触发浏览器下载。
 * 下载接口无法用自定义请求头（<a>/window.open 不带头），而本插件鉴权走 x-user-token 头，
 * 故这里用 fetch 带头取回 blob 再用临时链接下载。
 */
export async function downloadAuthed(
  path: string,
  filename: string,
): Promise<void> {
  await _authReady
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) {
    let msg = `下载失败 (${res.status})`
    try {
      const p = (await res.json()) as { error?: string } | null
      if (p?.error) msg = p.error
    } catch {
      /* 无 body */
    }
    throw new ApiError(msg, res.status)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * 上传单个文件到插件本地存储（经 POST /api/uploads），返回 { name, url, size, mime }。
 * FormData 不手动设 content-type（api 会让浏览器自带 multipart boundary）。
 */
export async function uploadFile(file: File): Promise<Attachment> {
  const fd = new FormData()
  fd.append('file', file)
  return api<Attachment>('/uploads', { method: 'POST', body: fd })
}
