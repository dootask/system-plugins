/** API handler 公用工具：从 URL pathname 末段或指定段位提取数字 id。 */

/** 取 pathname 中 `/<seg>/<id>` 紧跟 seg 后的数字段（找不到返回 null）。 */
export function idAfter(request: Request, seg: string): number | null {
  const { pathname } = new URL(request.url)
  const parts = pathname.split('/').filter(Boolean)
  const i = parts.lastIndexOf(seg)
  if (i < 0 || i + 1 >= parts.length) return null
  const n = Number(parts[i + 1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/** 取 pathname 末段数字（用于 .../insts/:id 这类）。 */
export function lastId(request: Request): number | null {
  const { pathname } = new URL(request.url)
  const parts = pathname.split('/').filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) {
    const n = Number(parts[i])
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

/** 取查询参数。 */
export function query(request: Request, key: string): string | null {
  return new URL(request.url).searchParams.get(key)
}
