import { createApp } from "vue"
import App from "./layout/index.vue"
import pinia, { GlobalStore } from "./store"
import { UserStore } from "./store/user"
import { routes } from "./routes/routes"
import I18n from "./lang/index"
import createDemoRouter from "./routes"
import "./assets/styles/index.less"
import directives from "@/directives/index"
import { initDooTask } from "@/utils/dootask"

const app = createApp(App)
const route = createDemoRouter(routes)
app.use(route)
app.use(I18n)
app.use(pinia)
app.use(directives)

// 加载
const globalStore = GlobalStore()
globalStore.init().then(async () => {
    // 拉取主程序数据并缓存 systemInfo（挂载前完成，保证首屏 apiUrl 等可用）
    const data = await initDooTask()
    if (data) {
        if (data.baseUrl) globalStore.setBaseUrl(data.baseUrl)
        if (data.themeName) globalStore.setThemeName(data.themeName === "auto" ? "light" : data.themeName)
        if (data.languageName) globalStore.setLanguage(data.languageName)
        if (data.userInfo) UserStore().setUserInfo(data.userInfo)
    }

    // 翻译
    window.$t = I18n.global.t

    // 初始化
    route.isReady().then(() => {
        app.mount("#vite-app")
    })
})
