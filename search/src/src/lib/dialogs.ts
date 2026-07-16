/**
 * 弹窗与消息统一走 @dootask/tools（主程序原生样式）：
 * - 确认框 modalConfirm；提示类 modalWarning / modalInfo
 * - 轻提示 messageSuccess / messageError
 * 脱离宿主（本地开发直开浏览器）时降级：确认用 window.confirm，消息走调用方兜底。
 */

let microCache: boolean | null = null

async function tools() {
  return import('@dootask/tools')
}

async function inHost(): Promise<boolean> {
  if (microCache !== null) return microCache
  try {
    microCache = await (await tools()).isMicroApp()
  } catch {
    microCache = false
  }
  return microCache
}

export async function confirmDialog(o: {
  title: string
  content?: string
  okText?: string
  cancelText?: string
}): Promise<boolean> {
  if (await inHost()) {
    try {
      return await (await tools()).modalConfirm({
        title: o.title,
        content: o.content ?? '',
        okText: o.okText,
        cancelText: o.cancelText,
      })
    } catch {
      /* 降级 */
    }
  }
  return window.confirm(o.content ? `${o.title}\n\n${o.content}` : o.title)
}

export async function warningDialog(title: string, content = ''): Promise<void> {
  if (await inHost()) {
    try {
      await (await tools()).modalWarning({ title, content })
      return
    } catch {
      /* 降级 */
    }
  }
  window.alert(content ? `${title}\n\n${content}` : title)
}

export async function notifySuccess(msg: string, fallback?: (m: string) => void) {
  if (await inHost()) {
    try {
      await (await tools()).messageSuccess(msg)
      return
    } catch {
      /* 降级 */
    }
  }
  fallback?.(msg)
}

export async function notifyError(msg: string, fallback?: (m: string) => void) {
  if (await inHost()) {
    try {
      await (await tools()).messageError(msg)
      return
    } catch {
      /* 降级 */
    }
  }
  fallback?.(msg)
}
