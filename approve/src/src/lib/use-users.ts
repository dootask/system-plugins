import { useEffect, useState } from 'react'
import { api } from '#/lib/api'
import { useT } from '#/lib/i18n/context'
import type { UserLite } from '#/lib/types'

const globalCache = new Map<number, UserLite>()

/**
 * 解析一批用户 ID 的展示信息（昵称 + 头像）。返回 id→UserLite 的查询函数。
 * 结果跨组件缓存，未解析到的回退为「用户#<id>」（无头像）。
 */
export function useUsers(ids: Array<number>) {
  const t = useT()
  const [, force] = useState(0)
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',')

  useEffect(() => {
    const want = key
      .split(',')
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && !globalCache.has(n))
    if (want.length === 0) return
    let cancelled = false
    api<Array<UserLite>>(`/users?ids=${want.join(',')}`)
      .then((list) => {
        if (cancelled) return
        for (const u of list) globalCache.set(u.userid, u)
        force((n) => n + 1)
      })
      .catch(() => {
        /* 解析失败时回退占位 */
      })
    return () => {
      cancelled = true
    }
  }, [key])

  return (id: number): UserLite =>
    globalCache.get(id) ?? {
      userid: id,
      nickname: t('app.userFallback', { id }),
    }
}

/** 兼容旧调用：仅取昵称的查询函数。 */
export function useUserNames(ids: Array<number>) {
  const userOf = useUsers(ids)
  return (id: number): string => userOf(id).nickname
}
