import { onMounted, ref } from "vue"
import {
    appReady,
    isMicroApp,
    getBaseUrl,
    getThemeName,
    getLanguageName,
    getUserInfo,
    getSystemInfo,
    nextZIndex as toolsNextZIndex,
} from "@dootask/tools"
import type { DooTaskSystemInfo } from "@dootask/tools"
// naive-ui 所有弹窗的层级由 vdirs 的全局单例 ZIndexManager 分配，这里直接拿到该
// 单例以便启动时播种基数（详见下方 seedZIndex）。
import zIndexManager from "vdirs/es/zindexable/z-index-manager"

/**
 * @dootask/tools 1.x 全量异步化适配层
 *
 * 1.x 起 @dootask/tools 的接口几乎都是 async（返回 Promise），且移除了同步的
 * getAppData。本模块负责：
 *  1. 启动时一次性拉取并缓存 systemInfo（apiUrl/origin/version），供 web.ts、
 *     utils.ts 等同步代码读取，避免把 async 扩散到整个调用链。
 *  2. 暴露 initDooTask() 在挂载前完成数据拉取与缓存。
 *  3. 启动时把 vdirs（naive-ui 弹窗层级管理器）的基数播种到主程序之上，从根上
 *     解决弹窗被主程序覆盖、以及应用内弹窗互相失序的问题（详见 seedZIndex）。
 */

// ---- systemInfo 同步缓存 ----
let systemInfoCache: DooTaskSystemInfo | null = null

export const getCachedSystemInfo = () => systemInfoCache

/** 主程序 API 地址（取不到返回 null，调用方自行兜底） */
export const systemApiUrl = (): string | null =>
    typeof systemInfoCache?.apiUrl === "string" ? systemInfoCache.apiUrl : null

/** 主程序源地址（systemInfo.origin 通过索引签名提供） */
export const systemOrigin = (): string | null =>
    typeof systemInfoCache?.origin === "string" ? (systemInfoCache.origin as string) : null

/** 主程序版本号（用于静态资源 hash） */
export const systemVersion = (): string => systemInfoCache?.version ?? ""

/**
 * 同步读取 micro-app 桥接的原始 props（window.microApp.getData().props）。
 * 仅用于挂载前需要同步判断的极少数场景（如初始可见性），避免首屏闪烁；
 * 非 micro-app 环境返回 null。
 */
export const getMicroProps = (): any => {
    try {
        return (window as any).microApp?.getData?.()?.props ?? null
    } catch {
        return null
    }
}

export interface DooTaskInitData {
    baseUrl: string
    themeName: string
    languageName: string
    userInfo: any
    systemInfo: DooTaskSystemInfo | null
}

/**
 * 启动初始化：在 micro-app 环境下拉取主程序数据并缓存 systemInfo。
 * 非 micro-app（独立调试）环境安全跳过，返回 null。
 */
export const initDooTask = async (): Promise<DooTaskInitData | null> => {
    let micro = false
    try {
        micro = await isMicroApp()
    } catch {
        micro = false
    }
    if (!micro) {
        return null
    }
    try {
        await appReady()
    } catch {
        // 忽略：appReady 失败时按独立环境处理
    }
    const [baseUrl, themeName, languageName, userInfo, systemInfo] = await Promise.all([
        getBaseUrl().catch(() => ""),
        getThemeName().catch(() => ""),
        getLanguageName().catch(() => "zh" as any),
        getUserInfo().catch(() => null),
        getSystemInfo().catch(() => null),
    ])
    systemInfoCache = systemInfo
    // 把 vdirs 的 z-index 基数播种到主程序当前层级之上（只播一次）
    try {
        const floor = await toolsNextZIndex()
        if (floor) seedZIndex(floor)
    } catch {
        // 取不到则保持 vdirs 默认基数 2000
    }
    return { baseUrl, themeName, languageName, userInfo, systemInfo }
}

/**
 * 响应式 isMicroApp 标记（1.x 起 isMicroApp 为异步）。
 * 初值 0，挂载后异步赋值，供模板 v-if 使用。
 */
export function useMicroFlag() {
    const inMicroApp = ref(0)
    onMounted(async () => {
        try {
            inMicroApp.value = (await isMicroApp()) ? 1 : 0
        } catch {
            inMicroApp.value = 0
        }
    })
    return inMicroApp
}

// ---- z-index 根治：播种 vdirs 全局计数器 ----
//
// naive-ui 所有弹窗（modal/drawer/popover/select/date-picker…）的层级都交给依赖
// vdirs 的全局单例 ZIndexManager 分配：它是一个同步、从 2000 起单调自增的计数器，
// 后开的弹窗天然在上、关闭后回收，应用内栈序本就正确。
//
// 但在 DooTask 微前端 inline 模式下，弹窗 teleport 到主程序 document.body，2000
// 起的基数可能低于主程序层级而被覆盖。过去为此给每个弹窗单独绑定主程序的
// nextZIndex()，1.x 起 nextZIndex 变为异步，逐弹窗各自 await 取号，多个异步回调
// 的完成顺序不等于开窗顺序 → 应用内弹窗互相失序（后开的反而在下）。
//
// 仿照官方 appstore 的做法：启动时只调一次主程序 nextZIndex() 取得「地板值」，把
// vdirs 的基数一次性抬到主程序之上。此后所有 naive 弹窗（含日后新增的）都经由
// vdirs 同步、单调取号，既高于主程序、彼此又按打开顺序正确叠放——无需逐个绑定。

/** 播种后的基数地板；message 等不走 vdirs 的弹窗在此之上取固定高值 */
let zIndexFloor = 2000
let zIndexSeeded = false

/** message/notification 容器层级：固定高于 vdirs 普通弹窗，确保提示始终在最上层 */
export const getMessageZIndex = (): number => zIndexFloor + 100000

/**
 * 把 vdirs 的 z-index 基数播种到 floor（主程序当前层级之上），并让其在所有弹窗
 * 关闭后回落到 floor 而非 vdirs 默认的 2000。只需在启动时执行一次。
 */
const seedZIndex = (floor: number) => {
    if (!floor || zIndexSeeded) return
    zIndexSeeded = true
    // 不低于 vdirs 默认基数 2000，避免主程序返回较小值时反而降低层级
    const base = Math.max(2000, floor)
    zIndexFloor = base
    const mgr = zIndexManager as any
    if (mgr.nextZIndex < base) mgr.nextZIndex = base
    // squashState 在受管元素清空时会把基数复位到 2000，改为复位到 base
    const originalSquash = mgr.squashState.bind(mgr)
    mgr.squashState = function () {
        if (this.elementCount === 0) {
            this.nextZIndex = base
            return
        }
        originalSquash()
    }
}
