import { GlobalStore } from "@/store"
import { addDataListener, removeDataListener, interceptBack } from "@dootask/tools"
import utils from "@/utils/utils";

export const initAppData = () => {
    const globalStore = GlobalStore()

    // 窗口监听器（autoTrigger=true，注册时立即以当前数据触发一次）
    const dataListener = (data: any) => {
        const props = data?.props
        if (!props) {
            return
        }
        if (props.type == "details" || props.open_type == "details") {
            globalStore.openOkrDetails(props.id || 0)
        }
    }
    addDataListener(dataListener, true)

    // 拦截返回事件（1.x 起 interceptBack 返回 Promise<() => void>）
    const unsubscribePromise = interceptBack(() => {
        return utils.beforeClose();
    })

    // 返回清理函数，以便可以手动调用
    return () => {
        removeDataListener(dataListener)
        unsubscribePromise.then((unsub) => unsub?.()).catch(() => {})
    }
}
