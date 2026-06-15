import { useEffect, useState } from 'react'
import { setAuth } from '#/lib/api'

export interface DooTaskUser {
  userid: number
  nickname?: string
  email?: string
  [key: string]: unknown
}

export type DooTaskStatus = 'loading' | 'ready' | 'standalone' | 'error'

export interface DooTaskState {
  status: DooTaskStatus
  user: DooTaskUser | null
  token: string | null
}

/**
 * 与主程序握手：appReady() 后取当前用户信息与 token。
 * - 在 DooTask 微前端里：status=ready，user 为当前登录用户。
 * - 直接浏览器打开（脱离宿主）：捕获 UnsupportedError，status=standalone。
 * @dootask/tools 是浏览器侧库，动态 import 以避免 SSR 阶段触碰 window。
 */
export function useDooTask(): DooTaskState {
  const [state, setState] = useState<DooTaskState>({
    status: 'loading',
    user: null,
    token: null,
  })

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        const tools = await import('@dootask/tools')
        const micro = await tools.isMicroApp()
        if (!micro) {
          // 独立模式：不带身份头。后端会拒绝鉴权接口，前端据 standalone 状态降级展示。
          setAuth({ userId: null, token: null })
          if (!cancelled) setState((s) => ({ ...s, status: 'standalone' }))
          return
        }
        await tools.appReady()
        const [user, token] = await Promise.all([
          tools.getUserInfo(),
          tools.getUserToken().catch(() => null),
        ])
        // 同步主程序主题到 <html>
        try {
          const theme = await tools.getThemeName()
          const dark = String(theme).includes('dark')
          const root = document.documentElement
          root.classList.toggle('dark', dark)
          root.classList.toggle('light', !dark)
          root.style.colorScheme = dark ? 'dark' : 'light'
        } catch {
          /* 主题获取失败不影响主流程 */
        }
        const typedUser = user as unknown as DooTaskUser
        // 写入全局鉴权状态，供 lib/api 的 api() 自动带上身份头（x-user-token 为权威凭据）。
        setAuth({
          userId: typedUser.userid,
          token: token ?? null,
        })
        if (!cancelled) {
          setState({
            status: 'ready',
            user: typedUser,
            token: token ?? null,
          })
        }
      } catch (e) {
        // 握手失败也要释放鉴权门闩，避免 api() 永远 await（后端会以 401 拒绝，前端按状态降级展示）。
        setAuth({ userId: null, token: null })
        const tools = await import('@dootask/tools').catch(() => null)
        if (tools && e instanceof tools.UnsupportedError) {
          if (!cancelled) setState((s) => ({ ...s, status: 'standalone' }))
        } else if (!cancelled) {
          setState((s) => ({ ...s, status: 'error' }))
        }
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
