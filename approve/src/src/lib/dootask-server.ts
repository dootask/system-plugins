import type { UserLite } from '#/lib/types'
import {
  SETTING_KEYS,
  getBotConfig,
  getSetting,
  setSetting,
} from '#/lib/repo/settings'

// 服务端用 DooTask Node SDK 与主程序交互：反查当前用户真实身份、解析昵称、
// 上传/共享文件、按身份解析角色成员、用审批机器人发待办消息等。
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
 * 把若干文件共享给若干用户（GET /api/file/share/update，permission=0 只读）。
 * 用机器人 token 执行（机器人是上传时的操作人则有权；否则尽力而为）。
 * 失败只记日志，不抛错——共享失败不应阻断审批流转，参与人仍可经详情页查看。
 */
export async function shareFilesToUsers(
  fileIds: Array<number>,
  userids: Array<number>,
  token: string | null,
): Promise<void> {
  if (fileIds.length === 0 || userids.length === 0) return
  const useToken = token || getBotConfig().token
  if (!useToken) return
  const client = await makeClient(useToken)
  if (!client) return
  await Promise.all(
    fileIds.map(async (id) => {
      try {
        await client.get('/api/file/share/update', {
          id,
          userids,
          permission: 0,
        })
      } catch (e) {
        console.error(
          '[approve] shareFilesToUsers failed:',
          (e as Error).message,
        )
      }
    }),
  )
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

// ───────────────────────── 审批机器人：私聊发待办消息 ─────────────────────────

const DEFAULT_BOT_NAME = '审批助手'

function botName(): string {
  return getSetting(SETTING_KEYS.botName) || DEFAULT_BOT_NAME
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 用操作人 token 向机器人私聊发 `/token` 指令并轮询取回机器人 token（同 crm 范式）。
 * 机器人回复模板消息 { type:'template', msg:{ type:'/token', data:{ token } } }。
 */
async function fetchBotToken(
  client: DTClient,
  botUserId: number,
): Promise<string | null> {
  try {
    const dlg = await client.post<{ id?: number }>('/api/dialog/open/user', {
      userid: botUserId,
    })
    const dialogId = Number(dlg.id) || null
    if (!dialogId) return null
    await client.post('/api/dialog/msg/sendtext', {
      dialog_id: dialogId,
      text: '/token',
    })
    for (let i = 0; i < 6; i++) {
      await delay(1500)
      const res = await client.get<{
        list?: Array<{
          type?: string
          msg?: { type?: string; data?: { token?: string } }
        }>
      }>('/api/dialog/msg/list', { dialog_id: dialogId, take: 10 })
      const list = Array.isArray(res.list) ? res.list : []
      for (const m of list) {
        if (
          m.type === 'template' &&
          m.msg?.type === '/token' &&
          m.msg.data?.token
        ) {
          return String(m.msg.data.token)
        }
      }
    }
    return null
  } catch (e) {
    console.error('[approve] fetchBotToken failed:', (e as Error).message)
    return null
  }
}

/**
 * 确保存在「审批助手」机器人并返回 { userid, token }。
 * 首次（用操作人 token）：复用同名 / 新建 → 取 token → 存 sys_settings；之后命中缓存。
 * 失败返回 null（调用方据此降级，不阻断审批主流程）。
 */
export async function ensureApproveBot(
  operatorToken: string | null,
): Promise<{ userid: number; token: string } | null> {
  const cfg = getBotConfig()
  if (cfg.token && cfg.userid) return { userid: cfg.userid, token: cfg.token }
  if (!operatorToken) return null
  try {
    const client = await makeClient(operatorToken)
    if (!client) return null
    const name = botName()
    let botId: number | null = null
    try {
      const list = await client.get<{
        list?: Array<{ id?: number; name?: string }>
      }>('/api/users/bot/list')
      const found = (list.list ?? []).find((b) => b.name === name)
      if (found) botId = Number(found.id) || null
    } catch {
      /* 列表取不到则走新建 */
    }
    if (!botId) {
      const bot = await client.post<{ id?: number }>('/api/users/bot/edit', {
        name,
      })
      botId = Number(bot.id) || null
    }
    if (!botId) return null
    const token = await fetchBotToken(client, botId)
    if (!token) return null
    setSetting(SETTING_KEYS.botUserId, String(botId))
    setSetting(SETTING_KEYS.botToken, token)
    setSetting(SETTING_KEYS.botName, name)
    return { userid: botId, token }
  } catch (e) {
    console.error('[approve] ensureApproveBot failed:', (e as Error).message)
    return null
  }
}

/**
 * 用审批机器人向某用户私聊发一条 markdown 消息，返回 { dialogId, msgId }。
 * 先 /api/dialog/open/user 取私聊 dialog，再 /api/dialog/msg/sendtext 发送
 * （update_mark=no：机器人专用，不计未读打扰）。失败返回 null，绝不抛错。
 */
export async function sendBotDirectMessage(
  toUserId: number,
  text: string,
  operatorToken: string | null,
): Promise<{ dialogId: number; msgId: number | null } | null> {
  const bot = await ensureApproveBot(operatorToken)
  if (!bot) return null
  try {
    const client = await makeClient(bot.token)
    if (!client) return null
    const dlg = await client.post<{ id?: number }>('/api/dialog/open/user', {
      userid: toUserId,
    })
    const dialogId = Number(dlg.id) || null
    if (!dialogId) return null
    const sent = await client.post<{ id?: number }>(
      '/api/dialog/msg/sendtext',
      {
        dialog_id: dialogId,
        text,
        text_type: 'md',
        update_mark: 'no',
      },
    )
    return { dialogId, msgId: Number(sent.id) || null }
  } catch (e) {
    console.error(
      '[approve] sendBotDirectMessage failed:',
      (e as Error).message,
    )
    return null
  }
}

/** 审批通知卡片类型（对应主程序还原的 approve-*.vue 模板）。 */
export type ApproveCardType =
  | 'approve_reviewer'
  | 'approve_notifier'
  | 'approve_submitter'
  | 'approve_comment_notifier'

/**
 * 以「审批助手(approval-alert)」机器人身份向某用户发送审批模板卡片（主程序 sendapprove 接口）。
 * 卡片仅展示、不与旧审批系统数据关联。token 为操作人凭据；失败仅记日志，不抛错。
 */
export async function sendApproveCard(
  toUserId: number,
  type: ApproveCardType,
  data: Record<string, unknown>,
  opts: { action?: string | null; isFinished?: boolean; title?: string },
  token: string | null,
): Promise<{ dialogId: number | null; msgId: number | null } | null> {
  if (!token) return null
  try {
    const client = await makeClient(token)
    if (!client) return null
    const res = await client.post<{ id?: number; dialog_id?: number }>(
      '/api/dialog/msg/sendapprove',
      {
        to_userid: toUserId,
        type,
        action: opts.action ?? '',
        is_finished: opts.isFinished ? 1 : 0,
        data,
        title: opts.title ?? '',
      },
    )
    return {
      dialogId: Number(res.dialog_id) || null,
      msgId: Number(res.id) || null,
    }
  } catch (e) {
    console.error('[approve] sendApproveCard failed:', (e as Error).message)
    return null
  }
}

/**
 * 拼一条「点开审批详情」的 open-micro-app 卡片（markdown 引用行，照 asset-hub）。
 * 点击后主程序以 iframe 微应用打开本工程详情页；url 用 {system_lang}/{system_theme}
 * 占位由主程序运行时替换，详情路由对齐本工程 `insts/$id`。
 */
export function buildDetailCard(instId: number, label: string): string {
  const url = `/apps/approve/{system_lang}/insts/${instId}?theme={system_theme}`
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
