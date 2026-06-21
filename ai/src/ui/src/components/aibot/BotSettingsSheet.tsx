import { useMemo, useState, useCallback, useEffect, useRef } from "react"

import { Plug, Search } from "lucide-react"
import { messageError } from "@dootask/tools"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ModelListTable, type ModelListTableHandle } from "@/components/aibot/ModelListTable"
import { AccountPanel } from "@/components/aibot/AccountPanel"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"

import type { AIBotItem, AIBotKey } from "@/data/aibots"
import type { GeneratedField, ModelOption } from "@/lib/aibot"
import { parseModelNames } from "@/lib/aibot"
import type { MCPConfig } from "@/data/mcp-config"
import { useI18n } from "@/lib/i18n-context"

// 「获取模型列表」按厂商分类（据模型 ID 子串归类，参考 new-api）
const VENDOR_BRAND: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  deepseek: "DeepSeek",
  meta: "Meta",
  mistral: "Mistral",
}

function classifyVendor(modelId: string): string {
  const s = modelId.toLowerCase()
  if (s.includes("gpt") || s.includes("o1") || s.includes("o3") || s.includes("o4") || s.includes("dall-e") || s.includes("whisper") || s.includes("text-embedding")) return "openai"
  if (s.includes("claude")) return "anthropic"
  if (s.includes("gemini")) return "gemini"
  if (s.includes("qwen") || s.includes("qwq")) return "qwen"
  if (s.includes("deepseek")) return "deepseek"
  if (s.includes("glm")) return "zhipu"
  if (s.includes("llama")) return "meta"
  if (s.includes("mistral")) return "mistral"
  return "other"
}

export interface BotSettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bots: AIBotItem[]
  activeBot: AIBotKey
  onActiveBotChange: (value: AIBotKey) => void
  fieldMap: Record<AIBotKey, GeneratedField[]>
  formValues: Record<AIBotKey, Record<string, string>>
  initialValues: Record<AIBotKey, Record<string, string>>
  loadingMap: Record<AIBotKey, boolean>
  savingMap: Record<AIBotKey, boolean>
  defaultsLoadingMap: Record<AIBotKey, boolean>
  onReload: (bot: AIBotKey) => void
  onChangeField: (bot: AIBotKey, prop: string, value: string) => void
  onSubmit: (bot: AIBotKey) => void
  onReset: (bot: AIBotKey) => void
  onUseDefaultModels: (bot: AIBotKey) => Promise<string | null>
  onRegisterModelEditorBackHandler?: (handler: () => boolean) => void
  mcps: MCPConfig[]
  onToggleModelMcp: (bot: AIBotKey, modelId: string, mcpId: string, checked: boolean) => void
  onApplyModelMcpToAll: (bot: AIBotKey, sourceModelId: string, allModelIds: string[]) => void
  onGatewayAuth: (token: string, baseUrl: string) => void | Promise<void>
  onGatewayLogout: () => void | Promise<void>
}

export const BotSettingsSheet = ({
  activeBot,
  bots,
  fieldMap,
  formValues,
  initialValues,
  loadingMap,
  onActiveBotChange,
  onChangeField,
  onOpenChange,
  onReload,
  onReset,
  onSubmit,
  onUseDefaultModels,
  open,
  savingMap,
  defaultsLoadingMap,
  onRegisterModelEditorBackHandler,
  mcps,
  onToggleModelMcp,
  onApplyModelMcpToAll,
  onGatewayAuth,
  onGatewayLogout,
}: BotSettingsSheetProps) => {
  const { t } = useI18n()
  const enabledMcps = useMemo(() => mcps.filter((mcp) => mcp.enabled !== false), [mcps])
  const mcpCountFor = useCallback(
    (modelId: string) =>
      modelId
        ? enabledMcps.filter((mcp) => (mcp.supportedModels ?? []).some((m) => m.id === modelId))
            .length
        : 0,
    [enabledMcps],
  )
  const [modelEditor, setModelEditor] = useState<{
    bot: AIBotItem
    field: GeneratedField
  } | null>(null)
  const [modelEditorValue, setModelEditorValue] = useState("")
  // 表格句柄：保存时同步读取最新序列化值，规避 onChange 的异步刷新
  const modelTableRef = useRef<ModelListTableHandle>(null)
  // 本次「获取模型列表」新加入的模型 code，用于在表格里高亮
  const [highlightedModelValues, setHighlightedModelValues] = useState<string[]>([])
  // 「获取模型列表」选择弹窗：拉取到的全部模型 + 已存在的 code 集合
  const [fetchDialog, setFetchDialog] = useState<{
    models: ModelOption[]
    existingValues: Set<string>
  } | null>(null)
  // 弹窗中已勾选待添加的模型 code
  const [fetchSelected, setFetchSelected] = useState<Set<string>>(new Set())
  // 弹窗搜索关键字 + 展开的厂商分组（手风琴）
  const [fetchSearch, setFetchSearch] = useState("")
  const [openGroups, setOpenGroups] = useState<string[]>([])

  const hasChanges = useMemo(() => {
    const result: Record<AIBotKey, boolean> = {} as Record<AIBotKey, boolean>
    bots.forEach((bot) => {
      const current = formValues[bot.value] ?? {}
      const initial = initialValues[bot.value] ?? {}
      const keys = new Set([...Object.keys(current), ...Object.keys(initial)])
      result[bot.value] = Array.from(keys).some(
        (key) => (current[key] ?? "") !== (initial[key] ?? ""),
      )
    })
    return result
  }, [bots, formValues, initialValues])

  const isModelEditorOpen = Boolean(modelEditor)
  const modelEditorOriginalValue = modelEditor
    ? formValues[modelEditor.bot.value]?.[modelEditor.field.prop] ?? ""
    : ""
  const modelEditorHasChanges = modelEditor
    ? modelEditorValue !== modelEditorOriginalValue
    : false
  const modelEditorSaving = modelEditor ? savingMap[modelEditor.bot.value] : false
  const modelEditorDefaultsLoading = modelEditor
    ? defaultsLoadingMap[modelEditor.bot.value]
    : false

  useEffect(() => {
    if (!open) {
      setModelEditor(null)
      setHighlightedModelValues([])
      setFetchDialog(null)
    }
  }, [open])

  useEffect(() => {
    if (!onRegisterModelEditorBackHandler) {
      return
    }
    const handler = () => {
      if (fetchDialog) {
        setFetchDialog(null)
        return true
      }
      if (modelEditor) {
        setModelEditor(null)
        return true
      }
      return false
    }
    onRegisterModelEditorBackHandler(handler)
    return () => {
      onRegisterModelEditorBackHandler(() => false)
    }
  }, [fetchDialog, modelEditor, onRegisterModelEditorBackHandler])

  const handleOpenModelEditor = useCallback(
    (bot: AIBotItem, field: GeneratedField) => {
      const currentValue = formValues[bot.value]?.[field.prop] ?? ""
      setModelEditor({ bot, field })
      setModelEditorValue(currentValue)
      setHighlightedModelValues([])
    },
    [formValues],
  )

  const handleCloseModelEditor = useCallback(() => {
    setModelEditor(null)
  }, [])

  const handleSaveModelEditor = useCallback(() => {
    if (!modelEditor) {
      setModelEditor(null)
      return
    }
    // 同步读取表格最新值，避免“输入未失焦即点保存”时读到旧的 modelEditorValue
    const currentValue = modelTableRef.current?.getSerializedValue() ?? modelEditorValue
    if (currentValue === modelEditorOriginalValue) {
      setModelEditor(null)
      return
    }
    // 兜底校验：序列化后超出该字段长度上限则阻止保存（获取列表时允许临时超出，保存时拦）
    const maxLength = modelEditor.field.maxlength
    if (typeof maxLength === "number" && maxLength > 0 && currentValue.length > maxLength) {
      messageError(t("sheet.models.tooLong"))
      return
    }
    onChangeField(modelEditor.bot.value, modelEditor.field.prop, currentValue)
    setModelEditor(null)
  }, [modelEditor, modelEditorOriginalValue, modelEditorValue, onChangeField, t])

  const handleUseDefaultModelsInternal = useCallback(async () => {
    if (!modelEditor || modelEditorDefaultsLoading || modelEditorSaving) {
      return
    }
    const result = await onUseDefaultModels(modelEditor.bot.value)
    if (typeof result !== "string") {
      return
    }
    // 拉取成功：弹出选择弹窗，默认勾选「未存在」的模型，已存在的禁止勾选
    const fetched = parseModelNames(result).filter((m) => m.value)
    const existing = parseModelNames(modelEditorValue)
    const existingValues = new Set(existing.map((m) => m.value))
    setFetchDialog({ models: fetched, existingValues })
    setFetchSelected(new Set(fetched.filter((m) => !existingValues.has(m.value)).map((m) => m.value)))
  }, [
    modelEditor,
    modelEditorDefaultsLoading,
    modelEditorSaving,
    modelEditorValue,
    onUseDefaultModels,
  ])

  // 弹窗中可勾选（未存在）的模型
  const fetchSelectableValues = useMemo(
    () =>
      fetchDialog
        ? fetchDialog.models
            .filter((m) => !fetchDialog.existingValues.has(m.value))
            .map((m) => m.value)
        : [],
    [fetchDialog],
  )
  const fetchAllSelected =
    fetchSelectableValues.length > 0 && fetchSelectableValues.every((v) => fetchSelected.has(v))
  const fetchSomeSelected = fetchSelectableValues.some((v) => fetchSelected.has(v))

  // 厂商分组标签：品牌名直出，通义千问/智谱/其他按语言本地化
  const categoryLabel = useCallback(
    (key: string) => {
      if (key === "qwen") return t("sheet.models.fetchVendorQwen")
      if (key === "zhipu") return t("sheet.models.fetchVendorZhipu")
      if (key === "other") return t("sheet.models.fetchVendorOther")
      return VENDOR_BRAND[key] ?? key
    },
    [t],
  )

  // 按搜索过滤后，按厂商分组（其他排最后，其余按标签字母序）
  const fetchGroups = useMemo<[string, ModelOption[]][]>(() => {
    if (!fetchDialog) return []
    const kw = fetchSearch.trim().toLowerCase()
    const filtered = kw
      ? fetchDialog.models.filter(
          (m) =>
            m.value.toLowerCase().includes(kw) || (m.label || "").toLowerCase().includes(kw),
        )
      : fetchDialog.models
    const map = new Map<string, ModelOption[]>()
    for (const m of filtered) {
      const k = classifyVendor(m.value)
      const arr = map.get(k)
      if (arr) arr.push(m)
      else map.set(k, [m])
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === "other") return 1
      if (b === "other") return -1
      return categoryLabel(a).localeCompare(categoryLabel(b))
    })
  }, [fetchDialog, fetchSearch, categoryLabel])

  // 打开弹窗时重置搜索；仅一个分组时默认展开它，否则全部收起
  useEffect(() => {
    if (!fetchDialog) {
      setFetchSearch("")
      setOpenGroups([])
      return
    }
    setFetchSearch("")
    const keys = Array.from(new Set(fetchDialog.models.map((m) => classifyVendor(m.value))))
    setOpenGroups(keys.length === 1 ? keys : [])
  }, [fetchDialog])

  const handleToggleGroup = useCallback((values: string[], checked: boolean) => {
    setFetchSelected((prev) => {
      const next = new Set(prev)
      values.forEach((v) => (checked ? next.add(v) : next.delete(v)))
      return next
    })
  }, [])

  const handleToggleFetchRow = useCallback((value: string, checked: boolean) => {
    setFetchSelected((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(value)
      } else {
        next.delete(value)
      }
      return next
    })
  }, [])

  const handleToggleFetchAll = useCallback(
    (checked: boolean) => {
      setFetchSelected(checked ? new Set(fetchSelectableValues) : new Set())
    },
    [fetchSelectableValues],
  )

  const handleCloseFetchDialog = useCallback(() => {
    setFetchDialog(null)
  }, [])

  const handleConfirmFetchDialog = useCallback(() => {
    if (!fetchDialog) {
      return
    }
    // 仅追加用户勾选的新模型，保留原有列表，高亮本次新加入的行
    const added = fetchDialog.models.filter(
      (m) => !fetchDialog.existingValues.has(m.value) && fetchSelected.has(m.value),
    )
    if (added.length) {
      const existing = parseModelNames(modelEditorValue)
      const merged = [...existing, ...added]
      const serialized = JSON.stringify(
        merged.map((m) => ({ id: m.value, name: m.label || m.value, thinking: m.thinking })),
      )
      setModelEditorValue(serialized)
      setHighlightedModelValues(added.map((m) => m.value))
    }
    setFetchDialog(null)
  }, [fetchDialog, fetchSelected, modelEditorValue])

  const renderField = (bot: AIBotItem, field: GeneratedField) => {
    const fieldValue = formValues[bot.value]?.[field.prop] ?? ""
    const maxLength = field.maxlength
    const showWordLimit = field.showWordLimit
    const modelOptions = field.type === "model"
      ? parseModelNames(formValues[bot.value]?.[`${bot.value}_models`])
      : []

    if (field.originalProp === "models") {
      const displayModels = parseModelNames(fieldValue)
      return (
        <div key={field.prop} className="space-y-2">
          <Label className="text-sm font-medium">{field.label}</Label>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 text-sm max-h-44 overflow-y-auto">
              {displayModels.length ? (
                <ul className="space-y-2">
                  {displayModels.map((item) => {
                    const mcpCount = mcpCountFor(item.value)
                    return (
                      <li
                        key={`${item.value}|${item.label}`}
                        className="leading-relaxed flex items-center justify-between gap-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="font-medium truncate">{item.label || item.value}</span>
                          {item.label && item.label !== item.value && (
                            <span className="text-muted-foreground text-xs truncate">{item.value}</span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {item.thinking !== "off" && (
                            <Badge variant="outline" className="font-normal">
                              {t("sheet.models.column.thinking")}: {t(`sheet.models.thinking.${item.thinking}`)}
                            </Badge>
                          )}
                          {mcpCount > 0 && (
                            <Badge variant="secondary" className="gap-1 font-normal">
                              <Plug className="h-3 w-3" />
                              {mcpCount}
                            </Badge>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("sheet.models.empty")}</p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenModelEditor(bot, field)}
            >
              {t("sheet.models.edit")}
            </Button>
          </div>
          {(field.link || field.tip) && (
            <p className="text-xs text-muted-foreground break-all">
              {field.link ? (
                <>
                  {field.tipPrefix ?? t("sheet.tipPrefix")}{" "}
                  <a
                    href={field.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    {field.link}
                  </a>
                </>
              ) : (
                field.tip
              )}
            </p>
          )}
        </div>
      )
    }

    const renderControl = () => {
      switch (field.type) {
        case "password":
          return (
            <Input
              type="password"
              value={fieldValue}
              onChange={(event) =>
                onChangeField(bot.value, field.prop, event.target.value)
              }
              placeholder={field.placeholder}
              maxLength={maxLength}
            />
          )
        case "textarea":
          return (
            <div className="space-y-2">
              <Textarea
                value={fieldValue}
                onChange={(event) =>
                  onChangeField(bot.value, field.prop, event.target.value)
                }
                placeholder={field.placeholder}
                maxLength={maxLength}
                rows={4}
              />
              {showWordLimit && maxLength && (
                <p className="text-xs text-muted-foreground">
                  {fieldValue.length}/{maxLength}
                </p>
              )}
              {field.functions && field.originalProp !== "models" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={defaultsLoadingMap[bot.value]}
                  onClick={() => onUseDefaultModels(bot.value)}
                >
                  {defaultsLoadingMap[bot.value] ? t("sheet.fetching") : field.functions}
                </Button>
              )}
            </div>
          )
        case "model":
          return (
            <Select
              value={fieldValue}
              onValueChange={(value) => onChangeField(bot.value, field.prop, value)}
              disabled={modelOptions.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={field.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        default:
          return (
            <Input
              value={fieldValue}
              onChange={(event) =>
                onChangeField(bot.value, field.prop, event.target.value)
              }
              placeholder={field.placeholder}
              maxLength={maxLength}
            />
          )
      }
    }

    return (
      <div key={field.prop} className="space-y-2">
        <Label className="text-sm font-medium">{field.label}</Label>
        {renderControl()}
        {(field.link || field.tip) && (
          <p className="text-xs text-muted-foreground break-all">
            {field.link ? (
              <>
                {field.tipPrefix ?? t("sheet.tipPrefix")}{" "}
                <a
                  href={field.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  {field.link}
                </a>
              </>
            ) : (
              field.tip
            )}
          </p>
        )}
      </div>
    )
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full max-w-2xl sm:max-w-4xl lg:max-w-4xl flex-col gap-6 overflow-hidden pt-[calc(var(--safe-area-top)+1.5rem)] pb-[calc(var(--safe-area-bottom)+1.5rem)]"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>{t("sheet.title")}</SheetTitle>
          </SheetHeader>
          <Tabs
            value={activeBot}
            onValueChange={(value) => onActiveBotChange(value as AIBotKey)}
            className="flex h-full flex-col overflow-hidden"
          >
            <ScrollArea className="w-full shrink-0 whitespace-nowrap pb-3">
              <TabsList className="inline-flex w-max gap-2">
                {bots.map((bot) => (
                  <TabsTrigger key={bot.value} value={bot.value} className="text-sm">
                    {bot.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            {bots.map((bot) => {
              const fields = fieldMap[bot.value] ?? []
              const isLoading = loadingMap[bot.value]
              return (
                <TabsContent
                  key={bot.value}
                  value={bot.value}
                  className="overflow-hidden data-[state=active]:min-h-0 data-[state=active]:flex"
                >
                  {isLoading ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                      {t("sheet.loading")}
                    </div>
                  ) : fields.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                      {t("sheet.empty")}
                    </div>
                  ) : (
                    <div className="flex flex-1 flex-col min-h-0">
                      <ScrollArea className="h-full">
                        <div className="flex flex-col gap-6 pb-10 pl-0.5 pr-3">
                          {bot.value === "dooai" && (
                            <AccountPanel
                              token={formValues[bot.value]?.["dooai_key"] ?? ""}
                              onAuth={onGatewayAuth}
                              onLogout={onGatewayLogout}
                            />
                          )}
                          {fields.map((field) => renderField(bot, field))}
                        </div>
                      </ScrollArea>
                      <SheetFooter className="gap-3 border-t pt-4">
                        <div className="flex flex-1 flex-wrap justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => onReload(bot.value)}
                              disabled={loadingMap[bot.value] || savingMap[bot.value]}
                            >
                              {t("sheet.reload")}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => onReset(bot.value)}
                              disabled={!hasChanges[bot.value]}
                            >
                              {t("sheet.reset")}
                            </Button>
                          </div>
                          <div className="flex items-center gap-3">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                              {t("sheet.back")}
                            </Button>
                            <Button
                              type="button"
                              onClick={() => onSubmit(bot.value)}
                              disabled={
                                savingMap[bot.value] ||
                                !hasChanges[bot.value]
                              }
                            >
                              {savingMap[bot.value] ? t("sheet.submitting") : t("sheet.submit")}
                            </Button>
                          </div>
                        </div>
                      </SheetFooter>
                    </div>
                  )}
                </TabsContent>
              )
            })}
          </Tabs>
        </SheetContent>
      </Sheet>
      <Sheet open={isModelEditorOpen} onOpenChange={(next) => !next && handleCloseModelEditor()}>
        <SheetContent
          side="right"
          className="flex w-full max-w-xl sm:max-w-3xl lg:max-w-3xl flex-col gap-0 overflow-hidden pt-[calc(var(--safe-area-top)+1.5rem)] pb-[calc(var(--safe-area-bottom)+1.5rem)]"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <SheetHeader className="pb-6">
            <SheetTitle>{t("sheet.models.drawerTitle")}</SheetTitle>
            {modelEditor && (
              <SheetDescription>
                {t("sheet.models.drawerDescription")} {modelEditor.bot.label}
              </SheetDescription>
            )}
          </SheetHeader>
          {modelEditor && (
            <ScrollArea className="flex-1">
              <div className="space-y-4 pr-3 pb-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{modelEditor.field.label}</Label>
                  <ModelListTable
                    ref={modelTableRef}
                    value={modelEditorValue}
                    onChange={setModelEditorValue}
                    modelLabel={t("sheet.models.column.model")}
                    displayLabel={t("sheet.models.column.label")}
                    actionLabel={t("sheet.models.column.actions")}
                    addButtonLabel={t("sheet.models.add")}
                    emptyLabel={t("sheet.models.empty")}
                    removeLabel={t("sheet.models.remove")}
                    removeSelectedLabel={t("sheet.models.removeSelected")}
                    modelPlaceholder={modelEditor.field.placeholder ?? t("sheet.models.modelPlaceholder")}
                    labelPlaceholder={t("sheet.models.labelPlaceholder")}
                    maxLength={modelEditor.field.maxlength}
                    disabled={modelEditorDefaultsLoading || modelEditorSaving}
                    highlightedValues={highlightedModelValues}
                    mcps={mcps}
                    onToggleModelMcp={(modelId, mcpId, checked) =>
                      onToggleModelMcp(modelEditor.bot.value, modelId, mcpId, checked)
                    }
                    onApplyModelMcpToAll={(sourceModelId, allModelIds) =>
                      onApplyModelMcpToAll(modelEditor.bot.value, sourceModelId, allModelIds)
                    }
                  />
                </div>
              </div>
              <ScrollBar orientation="vertical" />
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
          <SheetFooter className="gap-3 border-t pt-4">
            <div className="flex flex-1 flex-wrap justify-between gap-4">
              <div className="flex items-center gap-3">
                {modelEditor?.field.functions && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={modelEditorDefaultsLoading || modelEditorSaving}
                    onClick={handleUseDefaultModelsInternal}
                  >
                    {modelEditorDefaultsLoading
                      ? t("sheet.fetching")
                      : modelEditor.field.functions}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={handleCloseModelEditor}>
                  {t("sheet.models.cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveModelEditor}
                  disabled={!modelEditorHasChanges || modelEditorSaving}
                >
                  {t("sheet.models.save")}
                </Button>
              </div>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <Dialog
        open={Boolean(fetchDialog)}
        onOpenChange={(next) => !next && handleCloseFetchDialog()}
      >
        <DialogContent
          className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="space-y-1.5 border-b px-6 py-4 text-left">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>{t("sheet.models.fetchDialogTitle")}</DialogTitle>
              <span className="text-sm font-medium text-muted-foreground">
                {t("sheet.models.fetchFetched")} ({fetchDialog?.models.length ?? 0})
              </span>
            </div>
            <DialogDescription className="sr-only">
              {t("sheet.models.fetchDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          {fetchDialog && (
            <>
              <div className="border-b px-6 py-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={fetchSearch}
                    onChange={(e) => setFetchSearch(e.target.value)}
                    placeholder={t("sheet.models.fetchSearchPlaceholder")}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-1">
                {fetchGroups.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {t("sheet.models.fetchNoResult")}
                  </div>
                ) : (
                  <Accordion type="multiple" value={openGroups} onValueChange={setOpenGroups}>
                    {fetchGroups.map(([key, models]) => {
                      const selectable = models
                        .filter((m) => !fetchDialog.existingValues.has(m.value))
                        .map((m) => m.value)
                      const selCount = selectable.filter((v) => fetchSelected.has(v)).length
                      const allSel = selectable.length > 0 && selCount === selectable.length
                      const someSel = selCount > 0 && !allSel
                      return (
                        <AccordionItem key={key} value={key}>
                          <div className="flex items-center gap-3">
                            <AccordionTrigger className="flex-1">
                              <span>
                                {categoryLabel(key)} ({models.length})
                              </span>
                            </AccordionTrigger>
                            <span className="text-xs text-muted-foreground">
                              {selCount} / {selectable.length}
                            </span>
                            <Checkbox
                              checked={allSel}
                              indeterminate={someSel}
                              disabled={selectable.length === 0}
                              onCheckedChange={(c) => handleToggleGroup(selectable, c === true)}
                            />
                          </div>
                          <AccordionContent>
                            <div className="grid grid-cols-1 gap-x-6 gap-y-2 pb-3 pl-6 sm:grid-cols-2">
                              {models.map((model) => {
                                const exists = fetchDialog.existingValues.has(model.value)
                                const checked = exists || fetchSelected.has(model.value)
                                return (
                                  <label
                                    key={model.value}
                                    className={cn(
                                      "flex items-center gap-2",
                                      exists ? "opacity-60" : "cursor-pointer",
                                    )}
                                  >
                                    <Checkbox
                                      checked={checked}
                                      disabled={exists}
                                      onCheckedChange={(value) =>
                                        handleToggleFetchRow(model.value, value === true)
                                      }
                                    />
                                    <span className="truncate font-mono text-xs" title={model.value}>
                                      {model.value}
                                    </span>
                                    {exists && (
                                      <Badge variant="secondary" className="font-normal">
                                        {t("sheet.models.fetchExisting")}
                                      </Badge>
                                    )}
                                  </label>
                                )
                              })}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )
                    })}
                  </Accordion>
                )}
              </div>
              <div className="flex items-center justify-between border-t px-6 py-3 text-sm">
                <span className="text-muted-foreground">
                  {t("sheet.models.fetchSelectedCount")} {fetchSelected.size} /{" "}
                  {fetchSelectableValues.length}
                </span>
                <Checkbox
                  checked={fetchAllSelected}
                  indeterminate={fetchSomeSelected && !fetchAllSelected}
                  disabled={fetchSelectableValues.length === 0}
                  onCheckedChange={(checked) => handleToggleFetchAll(checked === true)}
                />
              </div>
            </>
          )}
          <DialogFooter className="gap-3 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={handleCloseFetchDialog}>
              {t("sheet.models.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleConfirmFetchDialog}
              disabled={fetchSelected.size === 0}
            >
              {`${t("sheet.models.fetchConfirm")} (${fetchSelected.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
