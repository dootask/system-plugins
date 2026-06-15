/**
 * 引擎依赖（resolveLeader / resolveRole）实现：用 DooTaskClient 查主程序部门与身份，
 * 据此解析「直属/多级主管」与「角色成员」。expandFlow 的 resolver 是同步签名，故先
 * 异步预取（部门表 + 角色成员名单）构建索引，再返回同步闭包供 createEngine 注入。
 *
 * resolveLeader(deptId, level)：
 *   - level=1 取该部门 owner_userid；level=2 取父部门 owner；以此类推沿 parent_id 上溯。
 *   - 找不到对应层级/无 owner → 返回 undefined（expandActor 会跳过该级，对齐旧引擎 dept==nil）。
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

interface DeptRow {
  id: number
  name: string
  parent_id: number
  owner_userid: number
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
): Promise<EngineDeps> {
  const [depts, roleMembers] = await Promise.all([
    fetchDepartments(token),
    fetchRoleMembers(token, roleIds),
  ])
  const byId = new Map<number, DeptRow>()
  for (const d of depts) byId.set(d.id, d)

  const resolveLeader = (
    deptId: number | null | undefined,
    level: number,
  ): number | undefined => {
    if (deptId == null) return undefined
    let cur = byId.get(deptId)
    // level=1 即当前部门主管；每升一级沿 parent_id 上溯一层。
    for (let i = 1; i < level && cur; i++) {
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
    }
    if (!cur || !cur.owner_userid) return undefined
    return cur.owner_userid
  }

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
    const list = await client.getUserDepartments()
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
