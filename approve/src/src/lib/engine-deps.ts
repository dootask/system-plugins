/**
 * 引擎依赖（resolveLeader / resolveRole）实现：用 DooTaskClient 查主程序部门与身份，
 * 据此解析「直属/多级主管」与「角色成员」。expandFlow 的 resolver 是同步签名，故先
 * 异步预取（部门表 + 角色成员名单）构建索引，再返回同步闭包供 createEngine 注入。
 *
 * resolveLeader(level)：返回第 level 级「上级负责人」的全部 userid（每个部门负责人 =
 *   主负责人 owner_userid + 部门管理员 deputy_userids）。口径：
 *   - 以发起人所属的全部部门为起点，逐级沿 parent_id 上溯，按"距离"分层；
 *   - 某部门里发起人本身是负责人 → 跳过该部门负责人、改取其父部门（取上级，不取同级）；
 *     发起人是普通成员 → 该部门负责人即其本级上级；
 *   - 跨级去重（同一人只在最近一级出现）、剔除发起人本人、跳过空层；
 *   - 没有该级（到顶/无更上级）→ 返回空数组（expandActor 跳过该级 → 最终无人则自动通过）。
 *   会签/或签/依次由流程节点的 approveMode 决定，与此解析无关。
 *
 * resolveRole(roleIds)：见文件尾「角色机制」说明。
 *   主程序无独立的「角色」实体，最接近的是 users.identity（如 admin）。本工程约定
 *   流程节点 settype=role 的 roleIds 是一组「身份标识」（用 String(roleId) 作 identity），
 *   通过 GET /api/users/lists?keys[identity]=... 取成员。因 resolver 是同步签名，需在
 *   buildEngineDeps 阶段把流程里用到的 roleIds 异步预取成 map 后再注入。
 *   预取失败/无该身份成员 → 该 role 节点审批人为空 → 节点按无审批人跳过。
 */
import { makeClient, resolveRoleMembers } from '#/lib/dootask-server'
import { collectRoleIds } from '#/lib/engine'
import type { EngineDeps } from '#/lib/engine'

export interface DeptRow {
  id: number
  name: string
  parent_id: number
  owner_userid: number
  /** 部门管理员（副负责人）userid 列表；与 owner_userid 一并视为该部门负责人。 */
  deputy_userids?: Array<number>
}

/** 某部门的全部负责人 = 主负责人 + 部门管理员。 */
function leadersOf(d: DeptRow): Array<number> {
  const out: Array<number> = []
  if (d.owner_userid) out.push(d.owner_userid)
  for (const u of d.deputy_userids ?? []) if (u) out.push(u)
  return out
}

/**
 * 逐级上级负责人分层：从发起人所属部门集出发 BFS 上溯，按距离分层。
 * 某层某部门里发起人本身是负责人 → 不取其同级负责人、把父部门并入下一层；
 * 普通成员 → 取该部门负责人。跨级去重、剔除发起人、跳过空层。返回 tiers[级-1]。
 */
export function leaderTiers(
  byId: Map<number, DeptRow>,
  startDeptIds: Array<number>,
  selfId: number,
): Array<Array<number>> {
  const tiers: Array<Array<number>> = []
  const seen = new Set<number>()
  const visited = new Set<number>()
  let frontier = new Set<number>(startDeptIds.filter((x) => Number.isFinite(x)))
  let guard = 0
  while (frontier.size > 0 && guard++ < 32) {
    const levelLeaders: Array<number> = []
    const next = new Set<number>()
    for (const did of frontier) {
      if (visited.has(did)) continue
      visited.add(did)
      const d = byId.get(did)
      if (!d) continue
      const leaders = leadersOf(d)
      if (leaders.includes(selfId)) {
        // 发起人是该部门负责人 → 其上级在父部门
        if (d.parent_id) next.add(d.parent_id)
      } else {
        for (const uid of leaders) {
          if (uid === selfId || seen.has(uid)) continue
          seen.add(uid)
          levelLeaders.push(uid)
        }
        // 成员的"更上级"在父部门（供 directorLevel>1 取下一级）
        if (d.parent_id) next.add(d.parent_id)
      }
    }
    if (levelLeaders.length > 0) tiers.push(levelLeaders)
    frontier = next
  }
  return tiers
}

/**
 * 据请求用户 token 预取部门表与（可选）流程用到的角色成员，构建同步 resolveLeader / resolveRole。
 * @param token  请求用户透传的 x-user-token（用于查主程序）。
 * @param roleIds 该流程定义里 settype=role 节点用到的角色 id（从 flow_nodes 提取）；
 *                传入则提前异步解析其成员，供同步 resolveRole 查表。不传则 role 节点无审批人。
 * SDK 不可用 / 拉取失败时返回空 deps（resolver 全部返回 undefined/[]，节点按无审批人跳过）。
 */
export async function buildEngineDeps(
  token: string | null,
  roleIds: Array<number> = [],
  selfId = 0,
): Promise<EngineDeps> {
  const [depts, roleMembers] = await Promise.all([
    fetchDepartments(token),
    fetchRoleMembers(token, roleIds),
  ])
  const byId = new Map<number, DeptRow>()
  for (const d of depts) byId.set(d.id, d)

  // 预算各级上级负责人（发起人 = 请求用户，其所属部门即 fetchDepartments 返回集）。
  const tiers = leaderTiers(
    byId,
    depts.map((d) => d.id),
    selfId,
  )
  const resolveLeader = (level: number): Array<number> => tiers[level - 1] ?? []

  // 角色：从预取的 roleId→成员 map 取并去重合并。
  const resolveRole = (ids: Array<number>): Array<number> => {
    const set = new Set<number>()
    for (const rid of ids) {
      for (const uid of roleMembers.get(rid) ?? []) set.add(uid)
    }
    return [...set]
  }

  return { resolveLeader, resolveRole }
}

/** 据流程定义（flow_nodes JSON）解析其 settype=role 节点用到的全部 roleIds，供发起/重提时预取。 */
export function roleIdsOfDef(
  flowNodesJson: string | null | undefined,
): Array<number> {
  if (!flowNodesJson) return []
  try {
    const root = JSON.parse(flowNodesJson) as unknown
    return collectRoleIds(root)
  } catch {
    return []
  }
}

async function fetchDepartments(token: string | null): Promise<Array<DeptRow>> {
  if (!token) return []
  try {
    const client = await makeClient(token)
    if (!client) return []
    // /api/users/info/departments 返回本人所属部门（含 deputy_userids、parent_id）。
    const list = (await client.getUserDepartments()) as Array<DeptRow>
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** 把每个 roleId 当主程序 identity 标识（String(roleId)）解析其成员，返回 roleId→userid[]。 */
async function fetchRoleMembers(
  token: string | null,
  roleIds: Array<number>,
): Promise<Map<number, Array<number>>> {
  const map = new Map<number, Array<number>>()
  if (roleIds.length === 0 || !token) return map
  await Promise.all(
    roleIds.map(async (rid) => {
      const members = await resolveRoleMembers([String(rid)], token)
      map.set(rid, members)
    }),
  )
  return map
}
