/**
 * 应用内「可关闭浮层」的返回拦截栈（配合 @dootask/tools 的 interceptBack）。
 *
 * 主程序的返回/关闭（移动端返回键、右上角胶囊关闭）会触发 interceptBack 回调。
 * 这里维护一个 LIFO 栈：每个打开的浮层（抽屉/弹窗）注册自己的关闭函数；
 *   - 回调时栈非空 → 关闭最近打开的浮层并「拦截」（返回 true，不退出应用）；
 *   - 栈为空 → 「放行」（返回 false，由主程序正常退出微应用）。
 *
 * 注册由 app-shell 统一接到 interceptBack；浮层组件用 useBackLayer 接入。
 */
import { useEffect, useRef } from 'react'

type CloseFn = () => void

const stack: Array<CloseFn> = []

/** 注册一个浮层的关闭函数（压栈），返回注销函数（出栈）。 */
export function pushBackLayer(close: CloseFn): () => void {
  stack.push(close)
  return () => {
    const i = stack.lastIndexOf(close)
    if (i >= 0) stack.splice(i, 1)
  }
}

/**
 * 处理一次返回：栈非空 → 关闭栈顶浮层并返回 true（拦截）；否则返回 false（放行）。
 * 供 app-shell 注册到 interceptBack（callback 返回 true 即阻止主程序关闭应用）。
 */
export function handleBackIntercept(): boolean {
  if (stack.length === 0) return false
  stack[stack.length - 1]()
  return true
}

/**
 * React hook：active 为真时把 close 注册进返回栈，active 变假或组件卸载时注销。
 * close 经 ref 取最新，避免闭包过期；仅 active 变化才重订阅。
 *
 * 用法（浮层组件内）：useBackLayer(open, () => setOpen(false))
 */
export function useBackLayer(active: boolean, close: CloseFn): void {
  const ref = useRef(close)
  ref.current = close
  useEffect(() => {
    if (!active) return
    return pushBackLayer(() => ref.current())
  }, [active])
}
