/**
 * 与 DooTask 主程序握手（浏览器侧，动态 import 避免 SSR 触碰 window）。
 * 拿 token 供 API 鉴权、同步移动端安全距离；脱离宿主时降级（standalone）。
 */
import { useEffect, useState } from 'react'
import { setUserToken, tokenFromUrl } from '#/lib/api'

export type BridgeStatus = 'loading' | 'ready' | 'standalone'

let sharedStatus: BridgeStatus = 'loading'
const subscribers = new Set<(s: BridgeStatus) => void>()
let handshake: Promise<void> | null = null

function emit(next: BridgeStatus) {
  sharedStatus = next
  for (const fn of subscribers) fn(next)
}

async function runHandshake(): Promise<void> {
  // 首屏兜底：菜单 url 里带的 user_token 先喂给 API 层
  setUserToken(tokenFromUrl())
  try {
    const tools = await import('@dootask/tools')
    if (!(await tools.isMicroApp())) {
      emit('standalone')
      return
    }
    await tools.appReady()
    const token = await tools.getUserToken().catch(() => null)
    setUserToken(token)
    // 同步主程序主题到 <html>（URL ?theme= 只是首屏兜底，这里以宿主实际主题为准）
    try {
      const theme = await tools.getThemeName()
      const dark = String(theme).includes('dark')
      const root = document.documentElement
      root.classList.toggle('dark', dark)
      root.classList.toggle('light', !dark)
      // 同步 color-scheme，否则首屏内联脚本写的旧值会残留
      root.style.colorScheme = dark ? 'dark' : 'light'
    } catch {
      /* 主题获取失败不影响主流程 */
    }
    // 移动端安全距离：顶部/底部让位（桌面为 0）
    try {
      const inset = await tools.getSafeArea()
      const root = document.documentElement
      root.style.setProperty('--safe-top', `${inset?.top ?? 0}px`)
      root.style.setProperty('--safe-bottom', `${inset?.bottom ?? 0}px`)
    } catch {
      /* 忽略 */
    }
    // 胶囊位置随视口宽度调整：≥sm(640px) 右距 24，窄屏 16（config.yml 静态值仅作首屏兜底）
    try {
      const mq = window.matchMedia('(min-width: 640px)')
      const applyCapsule = () => {
        tools.setCapsuleConfig({ top: 18, right: mq.matches ? 24 : 16 }).catch(() => {})
      }
      applyCapsule()
      mq.addEventListener('change', applyCapsule)
    } catch {
      /* 忽略 */
    }
    emit('ready')
  } catch {
    emit('standalone')
  }
}

export function useDooTask(): BridgeStatus {
  const [status, setStatus] = useState<BridgeStatus>(sharedStatus)
  useEffect(() => {
    subscribers.add(setStatus)
    setStatus(sharedStatus)
    if (!handshake) handshake = runHandshake()
    return () => {
      subscribers.delete(setStatus)
    }
  }, [])
  return status
}
