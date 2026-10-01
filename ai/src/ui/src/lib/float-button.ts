// ui/src/lib/float-button.ts
import { callExtraA, callExtraEmitter, getUserId } from "@dootask/tools"

// 偏好存放在主程序的本机 IndexedDB 中，键名需与主程序
// components/AIAssistant/float-button-preference.js 保持一致。
const cacheKey = (userId: number) => `aiAssistant.floatButtonVisible.${userId}`

/**
 * 读取当前账号的悬浮按钮显示偏好（默认显示）
 */
export const loadFloatButtonVisible = async (): Promise<boolean> => {
  try {
    const userId = await getUserId()
    if (!userId || userId <= 0) {
      return true
    }
    return Boolean(await callExtraA("IDBBoolean", cacheKey(userId), true))
  } catch (error) {
    console.error("Failed to load float button preference", error)
    return true
  }
}

/**
 * 保存悬浮按钮显示偏好，并通知主程序即时生效
 */
export const saveFloatButtonVisible = async (visible: boolean): Promise<void> => {
  const userId = await getUserId()
  if (!userId || userId <= 0) {
    return
  }
  await callExtraA("IDBSet", cacheKey(userId), visible)
  await callExtraEmitter("aiAssistantFloatButtonVisibilityChanged", { userId, visible })
}
