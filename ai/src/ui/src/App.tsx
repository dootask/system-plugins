import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  appReady,
  getUserInfo,
  modalConfirm,
  modalError,
  modalInfo,
  messageError,
  messageSuccess,
  openDialogUserid,
  requestAPI,
  interceptBack,
  getSafeArea,
} from "@dootask/tools"

import { BotCard } from "@/components/aibot/BotCard"
import { BotSettingsSheet } from "@/components/aibot/BotSettingsSheet"
import { MCPListCard } from "@/components/aibot/MCPListCard"
import { PreferencesCard } from "@/components/aibot/PreferencesCard"
import { MCPEditorSheet } from "@/components/aibot/MCPEditorSheet"
import { VisionConfigCard } from "@/components/aibot/VisionConfigCard"
import { VisionEditorSheet } from "@/components/aibot/VisionEditorSheet"
import type { AIBotItem, AIBotKey } from "@/data/aibots"
import { createLocalizedAIBotList } from "@/data/aibots"
import { getAISystemConfig, type SystemConfig } from "@/data/aibot-config"
import type { MCPConfig } from "@/data/mcp-config"
import { type VisionConfig, DEFAULT_VISION_CONFIG } from "@/data/vision-config"
import { loadFloatButtonVisible, saveFloatButtonVisible } from "@/lib/float-button"
import { mergeFields, parseModelNames, serializeModels, THINKING_EFFORTS } from "@/lib/aibot"
import type { GeneratedField, ThinkingEffort } from "@/lib/aibot"
import { useI18n } from "@/lib/i18n-context"
import { loadMCPConfigs, saveMCPConfig, saveMCPConfigs, deleteMCPConfig } from "@/lib/mcp-storage"
import { loadVisionConfig, saveVisionConfig } from "@/lib/vision-storage"

type SettingsState = Record<AIBotKey, Record<string, string>>
type LoadingState = Record<AIBotKey, boolean>

const getThemeFromSearch = () => {
  const params = new URLSearchParams(window.location.search)
  return params.get("theme") === "dark" ? "dark" : "light"
}

const applyTheme = (theme: "dark" | "light") => {
  const root = document.documentElement
  if (theme === "dark") {
    root.classList.add("dark")
    root.setAttribute("data-theme", "dark")
  } else {
    root.classList.remove("dark")
    root.setAttribute("data-theme", "light")
  }
}

const fieldMapFactory = (
  bots: AIBotItem[],
  config: SystemConfig,
): Record<AIBotKey, GeneratedField[]> => {
  const baseFields = config.fields
  return bots.reduce((acc, bot) => {
    acc[bot.value] = mergeFields(baseFields, config.aiList[bot.value], bot.value)
    return acc
  }, {} as Record<AIBotKey, GeneratedField[]>)
}

const emptyState = {} as SettingsState
const resolveErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object") {
    if ("msg" in error && error.msg) {
      return String(error.msg)
    }
    if ("message" in error && error.message) {
      return String(error.message)
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

function App() {
  const { lang, t } = useI18n()
  const systemConfig = useMemo(() => getAISystemConfig(lang), [lang])
  const [bots, setBots] = useState<AIBotItem[]>(() => createLocalizedAIBotList(lang))
  const [chatLoading, setChatLoading] = useState<LoadingState>({} as LoadingState)
  const [isAdmin, setIsAdmin] = useState(false)
  const [settingsOpen, setSettingsOpenState] = useState(false)
  const [activeBot, setActiveBot] = useState<AIBotKey>("openai")
  const [formValues, setFormValues] = useState<SettingsState>(emptyState)
  const [initialValues, setInitialValues] = useState<SettingsState>(emptyState)
  const [settingsLoadingMap, setSettingsLoadingMap] = useState<LoadingState>({} as LoadingState)
  const [settingsSavingMap, setSettingsSavingMap] = useState<LoadingState>({} as LoadingState)
  const [defaultsLoading, setDefaultsLoading] = useState<LoadingState>({} as LoadingState)

  const [mcps, setMcps] = useState<MCPConfig[]>([])
  const [mcpEditorOpen, setMcpEditorOpen] = useState(false)
  const [editingMcp, setEditingMcp] = useState<MCPConfig | null>(null)
  const [safeAreaReady, setSafeAreaReady] = useState(false)

  const [visionConfig, setVisionConfig] = useState<VisionConfig>(DEFAULT_VISION_CONFIG)
  const [visionEditorOpen, setVisionEditorOpen] = useState(false)

  const [floatButtonVisible, setFloatButtonVisible] = useState(true)
  const [floatButtonLoading, setFloatButtonLoading] = useState(true)

  const settingsOpenRef = useRef(settingsOpen)
  const mcpEditorOpenRef = useRef(mcpEditorOpen)
  const visionEditorOpenRef = useRef(visionEditorOpen)
  const interceptReleaseRef = useRef<(() => void) | null>(null)
  const modelEditorBackHandlerRef = useRef<() => boolean>(() => false)
  const autoProvisionTriedRef = useRef(false)
  // 始终指向最新 formValues：增量同步在登录/认领回调里读取当前 dooai 设置，避免闭包读到旧值
  const formValuesRef = useRef(formValues)
  // 模型增量同步进行中标记：刷新/认领/套餐变化可能并发触发，用它去重，避免同一批模型重复拉取与提示
  const syncingModelsRef = useRef(false)

  const fieldMap = useMemo(() => fieldMapFactory(bots, systemConfig), [bots, systemConfig])

  useEffect(() => {
    formValuesRef.current = formValues
  }, [formValues])

  useEffect(() => {
    settingsOpenRef.current = settingsOpen
  }, [settingsOpen])

  useEffect(() => {
    mcpEditorOpenRef.current = mcpEditorOpen
  }, [mcpEditorOpen])

  useEffect(() => {
    visionEditorOpenRef.current = visionEditorOpen
  }, [visionEditorOpen])

  useEffect(() => {
    setBots((prev) => createLocalizedAIBotList(lang, prev))
  }, [lang])

  useEffect(() => {
    applyTheme(getThemeFromSearch())
  }, [])

  useEffect(() => {
    let mounted = true
    const rootStyle = document.documentElement.style
    const applySafeArea = async () => {
      try {
        const area = await getSafeArea()
        rootStyle.setProperty("--safe-area-top", `${area?.top ?? 0}px`)
        rootStyle.setProperty("--safe-area-bottom", `${area?.bottom ?? 0}px`)
      } catch (error) {
        console.error("Failed to apply safe area", error)
      } finally {
        if (mounted) {
          setSafeAreaReady(true)
        }
      }
    }

    void applySafeArea()

    const handleResize = () => {
      void applySafeArea()
    }
    window.addEventListener("resize", handleResize)
    return () => {
      mounted = false
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      try {
        await appReady()
      } catch {
        // ignore; best effort
      }

      let isAdminLocal = false
      try {
        const user = await getUserInfo()
        if (user?.identity?.includes("admin")) {
          setIsAdmin(true)
          isAdminLocal = true
        }
      } catch {
        // cannot determine admin state, keep default false
      }

      void loadFloatButton()
      await refreshBotTags()
      await loadMcps()
      await loadVision()

      // 安装后首次打开：官方 Doo AI 未开通则自动开通临时账号（实例级配置，仅管理员）
      if (isAdminLocal) {
        await ensureDooaiProvisioned()
      }
    }

    init().catch((error) => {
      console.error("Failed to initialize AI assistant UI", error)
    })
    // 仅挂载时初始化一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadFloatButton = async () => {
    try {
      setFloatButtonVisible(await loadFloatButtonVisible())
    } finally {
      setFloatButtonLoading(false)
    }
  }

  const handleFloatButtonChange = async (visible: boolean) => {
    const previous = floatButtonVisible
    setFloatButtonVisible(visible)
    setFloatButtonLoading(true)
    try {
      await saveFloatButtonVisible(visible)
    } catch (error) {
      setFloatButtonVisible(previous)
      messageError(resolveErrorMessage(error, t("preferences.saveFailed")))
    } finally {
      setFloatButtonLoading(false)
    }
  }

  const loadMcps = async () => {
    try {
      const configs = await loadMCPConfigs()
      setMcps(configs)
    } catch (error) {
      console.error("Failed to load MCP configs", error)
    }
  }

  const loadVision = async () => {
    try {
      const config = await loadVisionConfig()
      setVisionConfig(config)
    } catch (error) {
      console.error("Failed to load vision config", error)
    }
  }

  const refreshBotTags = async () => {
    try {
      const { data } = await requestAPI({
        url: "assistant/models",
        method: "get",
      })
      if (!data || typeof data !== "object") {
        return
      }

      setBots((prev) =>
        prev.map((bot) => {
          const modelsRaw = data?.[`${bot.value}_models`]
          const defaultModel = data?.[`${bot.value}_model`]
          const options = parseModelNames(modelsRaw)
          const tagLabel =
            (options.find((option) => option.value === defaultModel)?.label ?? defaultModel) ||
            options[0]?.label

          return {
            ...bot,
            tags: options.map((option) => option.label),
            tagLabel: tagLabel ?? undefined,
            models: options,
          }
        }),
      )
    } catch (error) {
      console.error("Failed to fetch AI assistant models", error)
    }
  }

  const handleShowDescription = (bot: AIBotItem) => {
    modalInfo(bot.desc)
  }

  const handleStartChat = async (bot: AIBotItem) => {
    setChatLoading((prev) => ({ ...prev, [bot.value]: true }))
    try {
      const { data } = await requestAPI({
        url: "users/search/ai",
        method: "get",
        data: { type: bot.value },
      })
      if (!data?.userid) {
        throw new Error(t("errors.botNotFound"))
      }
      await openDialogUserid(Number(data.userid))
    } catch (error) {
      messageError(resolveErrorMessage(error, t("errors.botUnavailable")))
    } finally {
      setChatLoading((prev) => ({ ...prev, [bot.value]: false }))
    }
  }

  const loadSettings = async (bot: AIBotKey, force = false) => {
    if (!force && formValues[bot]) {
      return
    }
    setSettingsLoadingMap((prev) => ({ ...prev, [bot]: true }))
    try {
      const { data } = await requestAPI({
        url: "system/setting/aibot",
        method: "get",
        data: {
          type: "get",
          filter: bot,
        },
      })
      const payload = (data ?? {}) as Record<string, string>
      setFormValues((prev) => ({ ...prev, [bot]: payload }))
      setInitialValues((prev) => ({ ...prev, [bot]: payload }))
    } catch (error) {
      messageError(resolveErrorMessage(error, t("errors.loadFailed")))
    } finally {
      setSettingsLoadingMap((prev) => ({ ...prev, [bot]: false }))
    }
  }

  const ensureIntercept = useCallback(async () => {
    if (interceptReleaseRef.current) {
      return
    }
    try {
      interceptReleaseRef.current = await interceptBack(() => {
        if (modelEditorBackHandlerRef.current && modelEditorBackHandlerRef.current()) {
          return true
        }
        if (visionEditorOpenRef.current) {
          setVisionEditorOpen(false)
          return true
        }
        if (mcpEditorOpenRef.current) {
          setMcpEditorOpen(false)
          return true
        }
        if (settingsOpenRef.current) {
          setSettingsOpenState(false)
          return true
        }
        return false
      })
    } catch (error) {
      console.error("Failed to register interceptBack", error)
    }
  }, [])

  const releaseIntercept = useCallback(() => {
    if (interceptReleaseRef.current) {
      try {
        interceptReleaseRef.current()
      } catch (error) {
        console.error("Failed to release interceptBack", error)
      }
      interceptReleaseRef.current = null
    }
    modelEditorBackHandlerRef.current = () => false
  }, [])

  const handleRegisterModelEditorBackHandler = useCallback((handler: () => boolean) => {
    modelEditorBackHandlerRef.current = handler
  }, [])

  useEffect(() => {
    if (isAdmin && (settingsOpen || mcpEditorOpen || visionEditorOpen)) {
      void ensureIntercept()
    } else if (!settingsOpen && !mcpEditorOpen && !visionEditorOpen) {
      releaseIntercept()
    }
  }, [ensureIntercept, isAdmin, releaseIntercept, settingsOpen, mcpEditorOpen, visionEditorOpen])

  useEffect(() => {
    return () => {
      releaseIntercept()
    }
  }, [releaseIntercept])

  const handleOpenSettings = async (bot: AIBotItem) => {
    if (!isAdmin) {
      messageError(t("errors.adminOnly"))
      return
    }
    setActiveBot(bot.value)
    setSettingsOpenState(true)
    await loadSettings(bot.value)
  }

  const handleTabChange = async (value: AIBotKey) => {
    setActiveBot(value)
    await loadSettings(value)
  }

  const handleChangeField = (bot: AIBotKey, prop: string, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      [bot]: {
        ...(prev[bot] ?? {}),
        [prop]: value,
      },
    }))
  }

  const handleReset = (bot: AIBotKey) => {
    const original = initialValues[bot] ?? {}
    setFormValues((prev) => ({
      ...prev,
      [bot]: { ...original },
    }))
  }

  const handleReload = async (bot: AIBotKey) => {
    await loadSettings(bot, true)
  }

  const handleSubmit = async (bot: AIBotKey) => {
    const fields = fieldMap[bot] ?? []
    if (!fields.length) {
      messageError(t("errors.botUnsupported"))
      return
    }
    const payload = fields.reduce<Record<string, string>>((acc, field) => {
      acc[field.prop] = formValues[bot]?.[field.prop] ?? ""
      return acc
    }, {})

    setSettingsSavingMap((prev) => ({ ...prev, [bot]: true }))
    try {
      const response = await requestAPI({
        url: "system/setting/aibot",
        method: "post",
        data: {
          ...payload,
          type: "save",
          filter: bot,
        },
      })
      const savedData = (response.data ?? {}) as Record<string, string>
      setFormValues((prev) => ({ ...prev, [bot]: savedData }))
      setInitialValues((prev) => ({ ...prev, [bot]: savedData }))
      messageSuccess(response.msg ?? t("success.save"))
      await refreshBotTags()
    } catch (error) {
      modalError(resolveErrorMessage(error, t("errors.submitFailed")))
    } finally {
      setSettingsSavingMap((prev) => ({ ...prev, [bot]: false }))
    }
  }

  // 局部保存指定字段（供编辑模型抽屉「保存」直接入库：仅提交 overrides 里的字段，其余不动）。
  // 后端 setting__aibot 是合并语义（只覆盖传入且已存在的 key），故其它字段的库值不受影响；
  // 本地只把已保存字段并入基线，保留外层表单里其它字段的未保存编辑。返回是否成功。
  const handleSaveModels = async (
    bot: AIBotKey,
    overrides: Record<string, string>,
  ): Promise<boolean> => {
    setSettingsSavingMap((prev) => ({ ...prev, [bot]: true }))
    try {
      const response = await requestAPI({
        url: "system/setting/aibot",
        method: "post",
        data: { ...overrides, type: "save", filter: bot },
      })
      setFormValues((prev) => ({ ...prev, [bot]: { ...(prev[bot] ?? {}), ...overrides } }))
      setInitialValues((prev) => ({ ...prev, [bot]: { ...(prev[bot] ?? {}), ...overrides } }))
      messageSuccess(response.msg ?? t("success.save"))
      await refreshBotTags()
      return true
    } catch (error) {
      modalError(resolveErrorMessage(error, t("errors.submitFailed")))
      return false
    } finally {
      setSettingsSavingMap((prev) => ({ ...prev, [bot]: false }))
    }
  }

  // 官方厂商账号：开通/登录/退出后，把 gateway_token 与网关地址持久化到 aibotSetting
  const persistDootaskGateway = async (overrides: Record<string, string>) => {
    const bot: AIBotKey = "dooai"
    const merged = { ...(formValues[bot] ?? {}), ...overrides }
    setFormValues((prev) => ({ ...prev, [bot]: merged }))
    try {
      const response = await requestAPI({
        url: "system/setting/aibot",
        method: "post",
        data: { ...merged, type: "save", filter: bot },
      })
      const savedData = (response.data ?? {}) as Record<string, string>
      setFormValues((prev) => ({ ...prev, [bot]: savedData }))
      setInitialValues((prev) => ({ ...prev, [bot]: savedData }))
      await refreshBotTags()
    } catch (error) {
      modalError(resolveErrorMessage(error, t("errors.submitFailed")))
    }
  }

  // 静默拉取 Doo AI 模型列表并序列化为 dooai_models 字符串；失败返回 null（不弹错）。
  // 供"自动开通成功后自动补齐模型列表"复用，与手动 handleUseDefaultModels 的提示/loading 解耦。
  const fetchDooaiModels = async (baseUrl: string, key: string): Promise<string | null> => {
    if (!baseUrl || !key) return null
    try {
      const params = new URLSearchParams({ type: "dooai", base_url: baseUrl, key })
      const response = await fetch(`/ai/models/list?${params.toString()}`)
      const result = await response.json().catch(() => null)
      if (!response.ok || !result || result.code !== 200) return null
      const modelsArray = Array.isArray(result.data?.models) ? result.data.models : []
      if (!modelsArray.length) return null
      if (typeof modelsArray[0] === "object" && "id" in modelsArray[0]) {
        return JSON.stringify(
          modelsArray.map((model: { id: string; name?: string; thinking?: string }) => ({
            id: model.id,
            name: model.name || model.id,
            thinking: THINKING_EFFORTS.includes(model.thinking as ThinkingEffort)
              ? (model.thinking as ThinkingEffort)
              : "off",
          })),
        )
      }
      return (modelsArray as string[]).join("\n")
    } catch {
      return null
    }
  }

  // 安装后首次打开自动开通官方 Doo AI 临时账号：已开通则跳过(幂等)，未开通则最多重试 3 次，
  // 全部失败静默放弃，由账号面板的手动开通按钮兜底，绝不卡死。
  const ensureDooaiProvisioned = async () => {
    if (autoProvisionTriedRef.current) return
    autoProvisionTriedRef.current = true

    let existingModels = ""
    let existingDefaultModel = ""
    try {
      const { data } = await requestAPI({
        url: "system/setting/aibot",
        method: "get",
        data: { type: "get", filter: "dooai" },
      })
      const payload = (data ?? {}) as Record<string, string>
      setFormValues((prev) => ({ ...prev, dooai: payload }))
      setInitialValues((prev) => ({ ...prev, dooai: payload }))
      if (payload.dooai_key) return // 已开通，幂等跳过
      existingModels = (payload.dooai_models ?? "").trim()
      existingDefaultModel = (payload.dooai_model ?? "").trim()
    } catch (error) {
      console.warn("auto-provision: 读取 dooai 设置失败，跳过自动开通", error)
      return
    }

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const cfgRes = await fetch("/ai/gateway/config")
        const cfgJson = await cfgRes.json().catch(() => null)
        const baseUrl =
          cfgRes.ok && cfgJson?.data?.base_url ? String(cfgJson.data.base_url) : ""
        const provRes = await fetch("/ai/gateway/provision", { method: "POST" })
        const provJson = await provRes.json().catch(() => null)
        const tk = provJson?.data?.gateway_token
        if (provRes.ok && tk) {
          const overrides: Record<string, string> = {
            dooai_key: String(tk),
            dooai_base_url: baseUrl,
          }
          // 开通成功后自动补齐模型列表（best-effort、仅在原本为空时拉、失败不影响账号）
          let modelsStr = existingModels
          if (!modelsStr) {
            const fetched = await fetchDooaiModels(baseUrl, String(tk))
            if (fetched) {
              modelsStr = fetched
              overrides.dooai_models = fetched
            }
          }
          // 默认模型：未设置或不在列表中 → 取列表第一个
          if (modelsStr) {
            const ids = parseModelNames(modelsStr).map((o) => o.value)
            if (ids.length && (!existingDefaultModel || !ids.includes(existingDefaultModel))) {
              overrides.dooai_model = ids[0]
            }
          }
          await persistDootaskGateway(overrides)
          return
        }
      } catch (error) {
        console.warn(`auto-provision: 第 ${attempt + 1} 次自动开通失败`, error)
      }
      if (attempt < 2) await sleep(800 * (attempt + 1))
    }
    console.warn("auto-provision: 自动开通连续失败，回退手动开通")
  }

  // 增量同步 Doo AI 模型：拉取网关当前支持的模型，把 currentModelsStr 里缺失的项追加进去
  // （保留已存在项及其隐藏标记，不删除、不改动已存在项）。返回待写入的 overrides 与新增数量。
  const computeDooaiModelSync = async (
    baseUrl: string,
    key: string,
    currentModelsStr: string,
    currentDefaultModel: string,
  ): Promise<{ overrides: Record<string, string>; added: number }> => {
    const fetchedStr = await fetchDooaiModels(baseUrl, key)
    if (!fetchedStr) return { overrides: {}, added: 0 }
    const fetched = parseModelNames(fetchedStr)
    if (!fetched.length) return { overrides: {}, added: 0 }
    const current = parseModelNames(currentModelsStr)
    const currentById = new Map(current.map((m) => [m.value, m]))
    const existing = new Set(current.map((m) => m.value))
    const toAdd = fetched.filter((m) => !existing.has(m.value))
    if (!toAdd.length) return { overrides: {}, added: 0 }
    // 按接口返回顺序入库：命中项沿用本地已有的显示名/思考档位/隐藏标记；
    // 接口未返回的本地历史项保留在末尾（只增不删）
    const fetchedIds = new Set(fetched.map((m) => m.value))
    const inApiOrder = fetched.map((m) => currentById.get(m.value) ?? m)
    const leftovers = current.filter((m) => !fetchedIds.has(m.value))
    const merged = [...inApiOrder, ...leftovers]
    const overrides: Record<string, string> = { dooai_models: serializeModels(merged) }
    // 默认模型为空或已不在列表中时，补一个可见模型（优先非隐藏项）
    const ids = merged.map((m) => m.value)
    if (!currentDefaultModel.trim() || !ids.includes(currentDefaultModel.trim())) {
      const firstVisible = merged.find((m) => !m.hidden)?.value ?? ids[0]
      if (firstVisible) overrides.dooai_model = firstVisible
    }
    return { overrides, added: toAdd.length }
  }

  const handleGatewayAuth = async (token: string, baseUrl: string) => {
    // 登录/开通成功后增量同步网关模型：与 token/base_url 合并为单次持久化，避免二次保存覆盖新 token
    const overrides: Record<string, string> = { dooai_key: token, dooai_base_url: baseUrl }
    const dooai = formValuesRef.current.dooai ?? {}
    const sync = await computeDooaiModelSync(
      baseUrl,
      token,
      dooai.dooai_models ?? "",
      dooai.dooai_model ?? "",
    )
    Object.assign(overrides, sync.overrides)
    await persistDootaskGateway(overrides)
  }

  // 通用增量同步：token 不变但网关可见模型可能变化时触发（认领、刷新、检测到套餐升级）。
  // 只增不删；用 syncingModelsRef 去重并发触发，避免重复拉取/重复提示。
  const handleSyncDooaiModels = async () => {
    if (syncingModelsRef.current) return
    syncingModelsRef.current = true
    try {
      const dooai = formValuesRef.current.dooai ?? {}
      const baseUrl = dooai.dooai_base_url ?? ""
      const key = dooai.dooai_key ?? ""
      if (!baseUrl || !key) return
      const sync = await computeDooaiModelSync(
        baseUrl,
        key,
        dooai.dooai_models ?? "",
        dooai.dooai_model ?? "",
      )
      if (Object.keys(sync.overrides).length > 0) {
        await persistDootaskGateway(sync.overrides)
      }
    } finally {
      syncingModelsRef.current = false
    }
  }

  const handleGatewayLogout = async () => {
    await persistDootaskGateway({ dooai_key: "" })
  }

  const handleUseDefaultModels = async (bot: AIBotKey): Promise<string | null> => {
    if (defaultsLoading[bot]) return null
    const baseUrlKey = `${bot}_base_url`
    const keyKey = `${bot}_key`
    const agencyKey = `${bot}_agency`

    const params = new URLSearchParams({ type: bot })
    if (bot === "ollama") {
      const baseUrl = formValues[bot]?.[baseUrlKey]
      if (!baseUrl) {
        modalError(t("errors.baseUrlRequired"))
        return null
      }
      params.set("base_url", baseUrl)
      const keyValue = formValues[bot]?.[keyKey]
      if (keyValue) {
        params.set("key", keyValue)
      }
      const agencyValue = formValues[bot]?.[agencyKey]
      if (agencyValue) {
        params.set("agency", agencyValue)
      }
    } else if (bot === "dooai") {
      // Doo AI 厂商：从计量代理网关按 token 档位拉模型
      const baseUrl = formValues[bot]?.[baseUrlKey]
      const keyValue = formValues[bot]?.[keyKey]
      if (!baseUrl || !keyValue) {
        modalError(t("errors.dootaskLoginRequired"))
        return null
      }
      params.set("base_url", baseUrl)
      params.set("key", keyValue)
    } else {
      // 第三方厂商：用 API Key 直接向上游拉取模型列表；base_url 未填则用内置默认地址
      const keyValue = formValues[bot]?.[keyKey]
      if (!keyValue) {
        modalError(t("errors.keyRequired"))
        return null
      }
      params.set("key", keyValue)
      const baseUrl = formValues[bot]?.[baseUrlKey]
      if (baseUrl) {
        params.set("base_url", baseUrl)
      }
      const agencyValue = formValues[bot]?.[agencyKey]
      if (agencyValue) {
        params.set("agency", agencyValue)
      }
    }

    setDefaultsLoading((prev) => ({ ...prev, [bot]: true }))
    try {
      const response = await fetch(`/ai/models/list?${params.toString()}`)
      const result = await response.json().catch(() => null)

      if (!response.ok || !result) {
        throw new Error(t("errors.fetchFailed"))
      }

      if (result.code !== 200) {
        throw new Error(result.error || t("errors.fetchFailed"))
      }

      const modelsArray = Array.isArray(result.data?.models) ? result.data.models : []
      if (!modelsArray.length) {
        throw new Error(t("errors.modelsNotFound"))
      }

      // 处理新的 JSON 格式：检查是否是对象数组（包含 id, name, thinking 等）
      let modelsString: string
      if (modelsArray.length > 0 && typeof modelsArray[0] === 'object' && 'id' in modelsArray[0]) {
        // 新格式：序列化为模型列表 JSON（携带 thinking 默认档位）
        modelsString = JSON.stringify(
          modelsArray.map((model: { id: string; name?: string; thinking?: string }) => ({
            id: model.id,
            name: model.name || model.id,
            thinking: THINKING_EFFORTS.includes(model.thinking as ThinkingEffort)
              ? (model.thinking as ThinkingEffort)
              : "off",
          })),
        )
      } else {
        // 旧格式：字符串数组
        modelsString = (modelsArray as string[]).join("\n")
      }
      messageSuccess(t("success.fetchSuccess"))
      return modelsString
    } catch (error) {
      modalError(resolveErrorMessage(error, t("errors.fetchFailed")))
      return null
    } finally {
      setDefaultsLoading((prev) => ({ ...prev, [bot]: false }))
    }
  }

  const handleSheetOpenChange = (open: boolean) => {
    if (open && !isAdmin) {
      messageError(t("errors.adminOnly"))
      return
    }
    setSettingsOpenState(open)
  }

  const handleAddMcp = () => {
    if (!isAdmin) {
      messageError(t("errors.adminOnly"))
      return
    }
    setEditingMcp(null)
    setMcpEditorOpen(true)
  }

  const handleEditMcp = (mcp: MCPConfig) => {
    if (!isAdmin) {
      messageError(t("errors.adminOnly"))
      return
    }
    setEditingMcp(mcp)
    setMcpEditorOpen(true)
  }

  const handleDeleteMcp = async (mcp: MCPConfig) => {
    if (!isAdmin) {
      messageError(t("errors.adminOnly"))
      return
    }
    if (!(await modalConfirm(t("mcp.deleteMessage")))) {
      return
    }
    try {
      const newMcps = await deleteMCPConfig(mcp.id, mcps)
      setMcps(newMcps)
      messageSuccess(t("success.save"))
    } catch (error) {
      messageError(resolveErrorMessage(error, t("errors.submitFailed")))
    }
  }

  const handleSaveMcp = async (mcp: MCPConfig) => {
    try {
      const newMcps = await saveMCPConfig(mcp, mcps)
      setMcps(newMcps)
      messageSuccess(t("success.save"))
    } catch (error) {
      messageError(resolveErrorMessage(error, t("errors.submitFailed")))
    }
  }

  // 编辑模型抽屉里改的 MCP 归属只改本地草稿，点「保存」时才整体入库（见 BotSettingsSheet.mcpDraft）
  const handleSaveMcps = useCallback(
    async (next: MCPConfig[]) => {
      try {
        await saveMCPConfigs(next)
        setMcps(next)
        return true
      } catch (error) {
        modalError(resolveErrorMessage(error, t("errors.submitFailed")))
        return false
      }
    },
    [t],
  )

  const handleEditVision = () => {
    if (!isAdmin) {
      messageError(t("errors.adminOnly"))
      return
    }
    setVisionEditorOpen(true)
  }

  const handleSaveVision = async (config: VisionConfig) => {
    try {
      await saveVisionConfig(config)
      setVisionConfig(config)
      messageSuccess(t("success.save"))
    } catch (error) {
      messageError(resolveErrorMessage(error, t("errors.submitFailed")))
    }
  }

  if (!safeAreaReady) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 bg-background">
        <div className="loading-indicator"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 sm:px-10 pt-[calc(var(--safe-area-top)+1.5rem)] pb-[calc(var(--safe-area-bottom)+1.5rem)] sm:pt-[calc(var(--safe-area-top)+2.5rem)] sm:pb-[calc(var(--safe-area-bottom)+2.5rem)]">
        <header className="space-y-3">
          <h1 className="text-2xl font-semibold">{t("app.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("app.description")}</p>
        </header>
        <section>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {bots.map((bot) => (
              <BotCard
                key={bot.value}
                bot={bot}
                chatLoading={Boolean(chatLoading[bot.value])}
                isAdmin={isAdmin}
                onStartChat={handleStartChat}
                onOpenSettings={handleOpenSettings}
                onShowDescription={handleShowDescription}
              />
            ))}
          </div>
          {!bots.length && (
            <div className="flex items-center justify-center rounded-lg border border-dashed py-16 text-sm text-muted-foreground">
              {t("app.empty")}
            </div>
          )}
        </section>
        <section className="space-y-6">
          <PreferencesCard
            floatButtonVisible={floatButtonVisible}
            loading={floatButtonLoading}
            onFloatButtonChange={handleFloatButtonChange}
            t={t}
          />
          {isAdmin && (
            <>
              <MCPListCard
                mcps={mcps}
                bots={bots}
                onAdd={handleAddMcp}
                onEdit={handleEditMcp}
                onDelete={handleDeleteMcp}
              />
              <VisionConfigCard
                config={visionConfig}
                bots={bots}
                onEdit={handleEditVision}
                t={t}
              />
            </>
          )}
        </section>
      </div>
      {isAdmin && (
        <>
          <BotSettingsSheet
            open={Boolean(settingsOpen)}
            onOpenChange={handleSheetOpenChange}
            bots={bots}
            activeBot={activeBot}
            onActiveBotChange={handleTabChange}
            fieldMap={fieldMap}
            formValues={formValues}
            initialValues={initialValues}
            loadingMap={settingsLoadingMap}
            savingMap={settingsSavingMap}
            defaultsLoadingMap={defaultsLoading}
            onReload={handleReload}
            onChangeField={handleChangeField}
            onSubmit={handleSubmit}
            onSaveModels={handleSaveModels}
            onReset={handleReset}
            onUseDefaultModels={handleUseDefaultModels}
            onRegisterModelEditorBackHandler={handleRegisterModelEditorBackHandler}
            mcps={mcps}
            onSaveMcps={handleSaveMcps}
            onGatewayAuth={handleGatewayAuth}
            onGatewayLogout={handleGatewayLogout}
            onSyncModels={handleSyncDooaiModels}
          />
          <MCPEditorSheet
            open={mcpEditorOpen}
            onOpenChange={setMcpEditorOpen}
            mcp={editingMcp}
            bots={bots}
            onSave={handleSaveMcp}
          />
          <VisionEditorSheet
            open={visionEditorOpen}
            onOpenChange={setVisionEditorOpen}
            config={visionConfig}
            onSave={handleSaveVision}
            aiBots={bots}
            t={t}
          />
        </>
      )}
    </div>
  )
}

export default App
