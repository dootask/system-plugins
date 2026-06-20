import type { AIBotItem } from "@/data/aibots"
import type { FieldConfig, BotConfig } from "@/data/aibot-config"

export interface GeneratedField extends FieldConfig {
  prop: string
  originalProp: string
}

export type ThinkingEffort = "off" | "low" | "medium" | "high"

export const THINKING_EFFORTS: ThinkingEffort[] = ["off", "low", "medium", "high"]

const normalizeThinking = (value: unknown): ThinkingEffort =>
  THINKING_EFFORTS.includes(value as ThinkingEffort) ? (value as ThinkingEffort) : "off"

export interface ModelItem {
  id: string
  name: string
  support_mcp: boolean
  support_vision: boolean
  thinking: ThinkingEffort
}

export interface ModelOption {
  value: string
  label: string
  support_mcp: boolean
  support_vision: boolean
  thinking: ThinkingEffort
}

const mapModelArray = (items: Partial<ModelItem>[]): ModelOption[] =>
  items
    .filter((item) => item && item.id)
    .map((item) => ({
      value: String(item.id),
      label: item.name || String(item.id),
      support_mcp: item.support_mcp ?? false,
      support_vision: item.support_vision ?? false,
      thinking: normalizeThinking(item.thinking),
    }))

export const parseModelNames = (raw: string | ModelItem[] | undefined | null): ModelOption[] => {
  if (!raw) return []

  // 已经是数组格式（新的 JSON 格式）
  if (Array.isArray(raw)) {
    return mapModelArray(raw)
  }

  // 字符串形式的 JSON 数组
  const trimmed = raw.trim()
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return mapModelArray(parsed)
      }
    } catch {
      // 解析失败则回退到旧字符串解析
    }
  }

  // 兼容旧的字符串格式 "id | name"
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, label] = line.split("|").map((item) => item.trim())
      return {
        value,
        label: label || value,
        support_mcp: false,
        support_vision: false,
        thinking: "off" as ThinkingEffort,
      }
    })
    .filter((item) => item.value)
}

export const mergeFields = (
  baseFields: FieldConfig[],
  botConfig: BotConfig | undefined,
  type: AIBotItem["value"],
): GeneratedField[] => {
  const prefixed = baseFields.map((field) => ({
    ...field,
    prop: `${type}_${field.prop}`,
    originalProp: field.prop,
  }))

  botConfig?.extraFields?.forEach((extra) => {
    const targetProp = `${type}_${extra.prop}`
    const existingIndex = prefixed.findIndex((field) => field.prop === targetProp)
    const newField = {
      ...extra,
      prop: targetProp,
      originalProp: extra.prop,
    } as Partial<GeneratedField>

    if (existingIndex >= 0) {
      const definedEntries = Object.entries(newField).filter(
        ([, value]) => value !== undefined,
      )
      prefixed[existingIndex] = Object.assign(
        {},
        prefixed[existingIndex],
        Object.fromEntries(definedEntries),
      )
    } else if (extra.after) {
      const afterIndex = prefixed.findIndex(
        (field) => field.prop === `${type}_${extra.after}`,
      )
      if (afterIndex >= 0) {
        prefixed.splice(afterIndex + 1, 0, {
          label: extra.label ?? extra.prop,
          ...newField,
        } as GeneratedField)
        return
      }
      prefixed.push({
        label: extra.label ?? extra.prop,
        ...newField,
      } as GeneratedField)
    } else {
      prefixed.push({
        label: extra.label ?? extra.prop,
        ...newField,
      } as GeneratedField)
    }
  })

  let sortIndex = 999999
  prefixed.forEach((field) => {
    if (typeof field.sort === "undefined") {
      field.sort = ++sortIndex
    }
  })

  // 隐藏字段：值仍保留在 formValues 中（如官方厂商的 key/base_url 由账号面板自动写入），仅不在表单里展示
  const hidden = new Set(botConfig?.hiddenFields ?? [])
  const visible = hidden.size
    ? prefixed.filter((field) => !hidden.has(field.originalProp))
    : prefixed

  return visible.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
}
