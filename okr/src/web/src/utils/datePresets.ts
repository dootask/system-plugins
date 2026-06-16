/**
 * naive-ui n-date-picker daterange 的本地快捷选项，替代原本由主程序
 * extraCallA('timeOptionShortcuts') 提供的预设（1.x 已无法借主程序实例）。
 */

const startOfDay = (d: Date) => {
    d.setHours(0, 0, 0, 0)
    return d.getTime()
}

const endOfDay = (d: Date) => {
    d.setHours(23, 59, 59, 999)
    return d.getTime()
}

export const dateRangeShortcuts = (): Record<string, () => [number, number]> => ({
    [$t("本月")]: () => {
        const now = new Date()
        const start = new Date(now.getFullYear(), now.getMonth(), 1)
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        return [startOfDay(start), endOfDay(end)]
    },
    [$t("本季度")]: () => {
        const now = new Date()
        const q = Math.floor(now.getMonth() / 3)
        const start = new Date(now.getFullYear(), q * 3, 1)
        const end = new Date(now.getFullYear(), q * 3 + 3, 0)
        return [startOfDay(start), endOfDay(end)]
    },
    [$t("本年")]: () => {
        const now = new Date()
        const start = new Date(now.getFullYear(), 0, 1)
        const end = new Date(now.getFullYear(), 11, 31)
        return [startOfDay(start), endOfDay(end)]
    },
})
