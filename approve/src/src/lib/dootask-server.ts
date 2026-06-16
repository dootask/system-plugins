import type { UserLite } from '#/lib/types'

// 服务端用 DooTask Node SDK 与主程序交互：反查当前用户真实身份、解析昵称、
// 上传文件、按身份解析角色成员、用「审批」机器人发待办卡片等。
// 生产环境主程序地址为服务名 http://nginx；本地/独立模式无法连通时优雅降级。

const SERVER = process.env.DOOTASK_SERVER || 'http://nginx'
const cache = new Map<number, UserLite>()

/**
 * 把服务端取到的 userimg 规范化为浏览器（iframe 同域）可加载的地址。
 * 服务端经 http://nginx 反查得到的 userimg 常是内部源绝对地址（http://nginx/...）或
 * `{{RemoteURL}}` 占位，浏览器加载不到；剥成同域 root-relative `/...` 即可（与前端 getUserInfo 一致）。
 * 已是公网绝对地址 / 协议相对 / data: 则原样保留。
 */
function normalizeAvatar(raw?: string): string | undefined {
  if (!raw) return undefined
  let s = raw.trim()
  if (!s) return undefined
  s = s.replace(/^\{\{RemoteURL\}\}\/?/, '/')
  // 剥掉内部 origin（DOOTASK_SERVER 配置源 + 常见内部主机）→ 同域 root-relative。
  const serverOrigin = SERVER.replace(/\/+$/, '')
  if (serverOrigin && s.startsWith(serverOrigin)) s = s.slice(serverOrigin.length)
  s = s.replace(/^https?:\/\/(nginx|localhost|127\.0\.0\.1)(:\d+)?/i, '')
  return s || undefined
}

// DooTaskClient 暴露通用 get/post（自动带 Token 头、解包 data）与部分类型化方法。
// 这里只声明用到的，避免与 SDK 类型耦合。
type DTClient = {
  get: <T = unknown>(api: string, params?: unknown) => Promise<T>
  post: <T = unknown>(api: string, body?: unknown) => Promise<T>
  sendBotMessage: <T = unknown>(message: {
    userid: number
    text: string
    bot_type?: string
    bot_name?: string
    silence?: boolean
  }) => Promise<T>
  getUserBasic: (userid: number) => Promise<{
    userid: number
    nickname?: string
    email?: string
    userimg?: string
    department?: Array<number>
  }>
  getUsersBasic: (userids: Array<number>) => Promise<
    Array<{
      userid: number
      nickname?: string
      email?: string
      userimg?: string
      department?: Array<number>
    }>
  >
  getUserInfo: (noCache?: boolean) => Promise<{
    userid: number
    nickname?: string
    email?: string
    department?: Array<number>
    [k: string]: unknown
  }>
  getUserDepartments: () => Promise<
    Array<{
      id: number
      name: string
      parent_id: number
      owner_userid: number
    }>
  >
}

/** 主程序文件上传返回的关键字段（/api/file/content/upload 的 data）。 */
export interface UploadedFile {
  id: number
  name: string
  size?: number
  ext?: string
}

/** 用给定 token 构造一个 DooTaskClient；SDK 不可用时返回 null。 */
export async function makeClient(token: string): Promise<DTClient | null> {
  try {
    const mod = await import('@dootask/tools')
    const Ctor = (
      mod as unknown as { DooTaskClient: new (o: unknown) => DTClient }
    ).DooTaskClient
    return new Ctor({ token, server: SERVER, timeoutMs: 8000 })
  } catch {
    return null
  }
}

/**
 * 用前端透传的 token 反查主程序，确认 token 背后的真实用户身份。
 * 这是服务端鉴权的信任根：绝不信任前端自报的 x-user-id。
 * - token 无效 / 主程序不可达 / SDK 缺失 → 返回 null（调用方应拒绝请求）。
 */
export async function verifyUserToken(
  token: string,
): Promise<{ userid: number; nickname: string; email?: string } | null> {
  try {
    const client = await makeClient(token)
    if (!client) return null
    const u = await client.getUserInfo(true)
    const userid = Number(u.userid)
    if (!Number.isFinite(userid) || userid <= 0) return null
    return {
      userid,
      nickname: u.nickname || `用户#${userid}`,
      email: u.email,
    }
  } catch {
    return null
  }
}

/**
 * 取当前 token 用户的首选部门 id（用于 engine.start 的 Starter.deptId，
 * 供 settype=leader 节点解析主管）。无部门/不可达 → null。
 */
export async function getUserPrimaryDept(
  token: string | null,
): Promise<number | null> {
  if (!token) return null
  try {
    const client = await makeClient(token)
    if (!client) return null
    const u = await client.getUserInfo(true)
    const dept = u.department
    if (Array.isArray(dept) && dept.length > 0 && Number.isFinite(dept[0])) {
      return dept[0]
    }
    return null
  } catch {
    return null
  }
}

/**
 * 批量解析用户昵称。token 来自前端透传的 x-user-token。
 * 任意失败项回退为占位昵称，绝不抛错阻塞主流程。
 */
export async function resolveUsers(
  ids: Array<number>,
  token: string | null,
): Promise<Record<number, UserLite>> {
  const result: Record<number, UserLite> = {}
  const missing: Array<number> = []
  for (const id of ids) {
    if (cache.has(id)) result[id] = cache.get(id)!
    else missing.push(id)
  }

  if (missing.length && token) {
    const client = await makeClient(token)
    if (client) {
      await Promise.all(
        missing.map(async (id) => {
          try {
            const u = await client.getUserBasic(id)
            const lite: UserLite = {
              userid: id,
              nickname: u.nickname || `用户#${id}`,
              email: u.email,
              avatar: normalizeAvatar(u.userimg),
            }
            cache.set(id, lite)
            result[id] = lite
          } catch {
            result[id] = { userid: id, nickname: `用户#${id}` }
          }
        }),
      )
    }
  }

  for (const id of missing) {
    if (!(id in result)) result[id] = { userid: id, nickname: `用户#${id}` }
  }
  return result
}

// ───────────────────────── 文件：上传 / 共享 / 读取 ─────────────────────────

/**
 * 用操作人 token 把文件上传到主程序（POST /api/file/content/upload）。
 * 表单字段名为 `files`，主程序返回 data.{id,name,size,ext}。
 * token 缺失 / SDK 不可用 / 主程序拒绝 → 抛错（上传是用户显式动作，需如实反馈）。
 */
export async function uploadFile(
  token: string | null,
  file: { buffer: ArrayBuffer | Buffer; name: string; type?: string },
): Promise<UploadedFile> {
  if (!token) throw new Error('缺少用户凭据，无法上传')
  const bytes =
    file.buffer instanceof Buffer
      ? new Uint8Array(file.buffer)
      : new Uint8Array(file.buffer)
  const blob = new Blob([bytes], {
    type: file.type || 'application/octet-stream',
  })
  const form = new FormData()
  // 主程序 /api/file/content/upload 取 Request::file('files')。
  form.append('files', blob, file.name)
  // 不能走 DooTaskClient.post：它会对 body 做 JSON.stringify 并设 application/json，
  // 把 multipart 破坏掉（主程序读不到文件 → “您没有选择要上传的文件”）。
  // 直接 fetch，不手设 Content-Type，让运行时自动带 multipart boundary；鉴权用 Token 头（同 SDK）。
  let res: Response
  try {
    res = await fetch(`${SERVER}/api/file/content/upload`, {
      method: 'POST',
      headers: { Token: token },
      body: form,
    })
  } catch {
    throw new Error('无法连接主程序')
  }
  type UploadResp = {
    ret?: number
    msg?: string
    data?: { id?: number; name?: string; size?: number; ext?: string }
  }
  let payload: UploadResp | null = null
  try {
    payload = (await res.json()) as UploadResp
  } catch {
    /* 无 body */
  }
  if (!res.ok || !payload || payload.ret !== 1) {
    throw new Error(payload?.msg || `上传失败 (${res.status})`)
  }
  const data = payload.data ?? {}
  const id = Number(data.id)
  if (!Number.isFinite(id) || id <= 0)
    throw new Error('上传失败：未返回文件 id')
  return {
    id,
    name: data.name ?? file.name,
    size: data.size,
    ext: data.ext,
  }
}

/**
 * 取文件元信息（GET /api/file/one）。供查看/下载入口校验文件是否可读。
 * with_url=yes 时返回带 content_url。失败返回 null。
 */
export async function getFileOne(
  fileId: number,
  token: string | null,
): Promise<{
  id: number
  name?: string
  ext?: string
  content_url?: string
} | null> {
  if (!token) return null
  try {
    const client = await makeClient(token)
    if (!client) return null
    const data = await client.get<{
      id?: number
      name?: string
      ext?: string
      content_url?: string
    }>('/api/file/one', { id: fileId, with_url: 'yes' })
    if (!data.id) return null
    return {
      id: Number(data.id),
      name: data.name,
      ext: data.ext,
      content_url: data.content_url,
    }
  } catch {
    return null
  }
}

// ───────────────────────── 角色：按主程序身份解析成员 ─────────────────────────

/**
 * 按「身份标识」解析角色成员（GET /api/users/lists?keys[identity]=...）。
 * 主程序无独立的「角色」实体，角色 = users.identity（如 admin）。本工程的
 * settype=role 节点的 roleIds 即一组 identity 字符串；此处逐一查名单并去重合并。
 * 任意失败回退为空，不抛错（节点按无审批人跳过）。
 */
export async function resolveRoleMembers(
  identities: Array<string>,
  token: string | null,
): Promise<Array<number>> {
  if (identities.length === 0 || !token) return []
  const client = await makeClient(token)
  if (!client) return []
  const set = new Set<number>()
  await Promise.all(
    identities.map(async (identity) => {
      if (!identity) return
      try {
        const res = await client.get<{
          data?: Array<{ userid?: number }>
        }>('/api/users/lists', {
          keys: { identity },
          pagesize: 100,
        })
        const rows = Array.isArray(res.data) ? res.data : []
        for (const r of rows) {
          const uid = Number(r.userid)
          if (Number.isFinite(uid) && uid > 0) set.add(uid)
        }
      } catch (e) {
        console.error(
          '[approve] resolveRoleMembers failed:',
          (e as Error).message,
        )
      }
    }),
  )
  return [...set]
}

// ───────────────────────── 部门：id → 名称（导出用） ─────────────────────────

/**
 * 取主程序全部部门的 id→名称映射（GET /api/users/department/list，限 DooTask 系统管理员）。
 * 仅导出场景用（操作人需为系统管理员）；非管理员/不可达时返回空 Map，调用方降级（部门列留空）。
 */
export async function fetchDepartmentNames(
  token: string | null,
): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (!token) return out
  try {
    const client = await makeClient(token)
    if (!client) return out
    const rows = await client.get<Array<{ id?: number; name?: string }>>(
      '/api/users/department/list',
    )
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const id = Number(r.id)
        if (Number.isFinite(id) && r.name) out.set(id, r.name)
      }
    }
  } catch {
    /* 非管理员或不可达：降级为空 */
  }
  return out
}

// ───────────────────────── 审批机器人：私聊发待办卡片 ─────────────────────────

/**
 * 用「审批」机器人（approval-alert，旧审批系统同款）向某用户发一条 markdown 卡片。
 * 直接用 @dootask/tools 的 client.sendBotMessage（内部走 /api/dialog/msg/sendbot，
 * 以操作人 token 鉴权、botGetOrCreate('approval-alert') 身份发 type=md），不自建机器人。
 * 失败返回 null，绝不抛错。
 */
export async function sendApprovalCard(
  toUserId: number,
  text: string,
  operatorToken: string | null,
): Promise<{ dialogId: number | null; msgId: number | null } | null> {
  if (!operatorToken) return null
  try {
    const client = await makeClient(operatorToken)
    if (!client) return null
    const res = await client.sendBotMessage<{ id?: number; dialog_id?: number }>(
      { userid: toUserId, text, bot_type: 'approval-alert' },
    )
    return {
      dialogId: Number(res.dialog_id) || null,
      msgId: Number(res.id) || null,
    }
  } catch (e) {
    console.error('[approve] sendApprovalCard failed:', (e as Error).message)
    return null
  }
}

/**
 * 拼一条「点开审批详情」的 open-micro-app 卡片（markdown 引用行，照 asset-hub）。
 * 点击后主程序读 data-app-config 以 iframe 微应用打开本工程详情页（DialogWrapper
 * 的 handleOpenMicroApp）。{system_theme}/{system_lang} 占位由主程序运行时替换；
 * 本工程路由无 lang 路径段，故 lang/theme 走 query（对齐 config.yml 菜单 url）。
 */
export function buildDetailCard(instId: number, label: string): string {
  const url = `/apps/approve/insts/${instId}?theme={system_theme}&lang={system_lang}`
  const appConfig = JSON.stringify({
    id: 'approve',
    name: 'approve-detail',
    immersive: true,
    keep_alive: false,
    url_type: 'iframe',
    url,
  })
  return `> <div class="open-micro-app" data-app-config='${appConfig}'>${label}</div>`
}
