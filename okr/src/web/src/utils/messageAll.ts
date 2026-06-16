import { createDiscreteApi } from "naive-ui"
import { getMessageZIndex } from "./dootask"

const MessageType = ref('')

// 懒创建 discrete message：首次使用时（此时启动已播种 z-index 基数）给容器一个高
// 于普通弹窗的固定层级，确保消息提示始终在最上层、且高于主程序。
let messageApi: ReturnType<typeof createDiscreteApi>["message"] | null = null

function getMessage() {
    if (!messageApi) {
        const { message } = createDiscreteApi(["message"], {
            messageProviderProps: { containerStyle: { zIndex: String(getMessageZIndex()) } },
        })
        messageApi = message
    }
    return messageApi
}

export function useMessage() {
    function destroyAll() {
      getMessage()?.destroyAll();
    }

    function create(content, option?) {
      MessageType.value = 'create'
      const message = getMessage()
      message?.destroyAll();
      message?.create(content, option);
    }

    function error(content, option?) {
        MessageType.value = 'error'
        const message = getMessage()
        message?.destroyAll();
        message?.error(content, option);

    }

    function info(content, option?) {
      MessageType.value = 'info'
      const message = getMessage()
      message?.destroyAll();
      message?.info(content, option);
    }

    function loading(content, option?) {
      MessageType.value = 'loading'
      const message = getMessage()
      message?.destroyAll();
      message?.loading(content, option);
    }

    function success(content, option?) {
      MessageType.value = 'success'
      const message = getMessage()
      message?.destroyAll();
      message?.success(content, option);
    }

    function warning(content, option?) {
      MessageType.value = 'warning'
      const message = getMessage()
      message?.destroyAll();
      message?.warning(content, option);
    }

    return {
      destroyAll,
      create,
      error,
      info,
      loading,
      success,
      warning,
    };
  }
