// 人员/部门选择器（前端动态 import @dootask/tools，避免 SSR 触碰 window）。
// 与 crm 的 pickUsers 同构：取消返回 cancelled，独立模式返回 standalone。

/** 动态加载浏览器侧 SDK（避免 SSR 触碰 window，且规避顶层 import() 类型注解 lint）。 */
function loadTools() {
  return import('@dootask/tools')
}

export type PickResult =
  | { status: 'picked'; ids: Array<number> }
  | { status: 'cancelled' }
  | { status: 'standalone' }

/** 打开主程序选人。multiple=false 时限选 1 人。 */
export async function pickUsers(params?: {
  value?: Array<number>
  multiple?: boolean
}): Promise<PickResult> {
  let tools: Awaited<ReturnType<typeof loadTools>>
  try {
    tools = await loadTools()
  } catch {
    return { status: 'standalone' }
  }
  try {
    if (!(await tools.isMicroApp())) return { status: 'standalone' }
  } catch {
    return { status: 'standalone' }
  }
  try {
    const ids = await tools.selectUsers({
      value: params?.value ?? [],
      multipleMax: params?.multiple === false ? 1 : undefined,
    })
    if (!Array.isArray(ids) || ids.length === 0) return { status: 'cancelled' }
    return { status: 'picked', ids }
  } catch {
    return { status: 'cancelled' }
  }
}
