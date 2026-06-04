import type { Language } from "@/lib/i18n-core"
import type { AIBotKey } from "./aibots"

export type FieldControlType = "text" | "password" | "textarea" | "model"

export interface FieldConfig {
  label: string
  prop: string
  type?: FieldControlType
  placeholder?: string
  maxlength?: number
  showWordLimit?: number
  tip?: string
  tipPrefix?: string
  link?: string
  functions?: string
  sort?: number
}

export type ExtraFieldConfig = {
  prop: string
  after?: string
} & Partial<Omit<FieldConfig, "prop">>

export interface BotConfig {
  extraFields?: ExtraFieldConfig[]
}

export interface SystemConfig {
  fields: FieldConfig[]
  aiList: Record<AIBotKey, BotConfig>
}

const createFields = (lang: Language): FieldConfig[] => {
  const isZh = lang === "zh"
  return [
    {
      label: "API Key",
      prop: "key",
      type: "password",
    },
    {
      label: isZh ? "模型列表" : "Model List",
      prop: "models",
      type: "textarea",
      maxlength: 1000,
      showWordLimit: 0.9,
      placeholder: isZh ? "一行一个模型名称" : "One model name per line",
      functions: isZh ? "使用默认模型列表" : "Use default model list",
    },
    {
      label: isZh ? "默认模型" : "Default Model",
      prop: "model",
      type: "model",
      placeholder: isZh ? "请选择默认模型" : "Select a default model",
      tip: isZh ? "可选数据来自模型列表" : "Options come from the model list",
    },
    {
      label: "Base URL",
      prop: "base_url",
      placeholder: isZh ? "请输入 Base URL..." : "Enter the base URL...",
      tip: isZh
        ? "API 请求的基础 URL 路径，如果没有请留空"
        : "Base URL for API requests. Leave empty if none.",
    },
    {
      label: isZh ? "使用代理" : "Use Proxy",
      prop: "agency",
      placeholder: isZh ? "支持 http 或 socks 代理" : "Supports http or socks proxy",
      tip: isZh
        ? "例如：http://proxy.com 或 socks5://proxy.com"
        : "For example: http://proxy.com or socks5://proxy.com",
    },
    {
      label: "Temperature",
      prop: "temperature",
      placeholder: isZh
        ? "模型温度，低则保守，高则多样"
        : "Model temperature; lower is more conservative, higher is more diverse",
      tip: isZh
        ? "例如：0.7，范围：0-1，默认：0.7"
        : "For example: 0.7. Range: 0-1. Default: 0.7",
    },
    {
      label: isZh ? "默认提示词" : "Default Prompt",
      prop: "system",
      type: "textarea",
      maxlength: 20000,
      showWordLimit: 0.9,
      placeholder: isZh ? "请输入默认提示词" : "Enter the default prompt",
      tip: isZh ? "例如：你是一个人开发的AI助手" : "For example: You are the AI assistant for a solo developer.",
    },
  ]
}

const createAiList = (lang: Language): Record<AIBotKey, BotConfig> => {
  const isZh = lang === "zh"
  return {
    openai: {
      extraFields: [
        {
          prop: "key",
          placeholder: "OpenAI API Key",
          link: "https://platform.openai.com/account/api-keys",
        },
        {
          prop: "models",
          link: "https://platform.openai.com/docs/models",
        },
      ],
    },
    claude: {
      extraFields: [
        {
          prop: "key",
          placeholder: "Claude API Key",
          link: "https://docs.anthropic.com/en/api/getting-started",
        },
        {
          prop: "models",
          link: "https://docs.anthropic.com/en/docs/about-claude/models",
        },
      ],
    },
    deepseek: {
      extraFields: [
        {
          prop: "key",
          placeholder: "DeepSeek API Key",
          link: "https://platform.deepseek.com/api_keys",
        },
        {
          prop: "models",
          link: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing",
        },
      ],
    },
    gemini: {
      extraFields: [
        {
          prop: "key",
          placeholder: "Gemini API Key",
          link: "https://makersuite.google.com/app/apikey",
        },
        {
          prop: "models",
          link: "https://ai.google.dev/models/gemini",
        },
        {
          prop: "agency",
          placeholder: isZh ? "仅支持 http 代理" : "Only http proxy is supported",
          tip: isZh ? "例如：http://proxy.com" : "For example: http://proxy.com",
        },
      ],
    },
    grok: {
      extraFields: [
        {
          prop: "key",
          placeholder: "Grok API Key",
          link: "https://docs.x.ai/docs/tutorial",
        },
        {
          prop: "models",
          link: "https://docs.x.ai/docs/models",
        },
      ],
    },
    ollama: {
      extraFields: [
        {
          prop: "base_url",
          placeholder: "http://localhost:11434",
          tip: isZh ? "例如：http://localhost:11434" : "For example: http://localhost:11434",
        },
        {
          prop: "models",
          tip: isZh
            ? "点击下方按钮可获取默认模型列表"
            : "Click the button below to fetch the default model list.",
        },
      ],
    },
    zhipu: {
      extraFields: [
        {
          prop: "key",
          placeholder: isZh ? "智谱 API Key" : "Zhipu API Key",
          link: "https://open.bigmodel.cn/usercenter/apikeys",
        },
        {
          prop: "models",
          link: "https://open.bigmodel.cn/dev/api",
        },
      ],
    },
    qianwen: {
      extraFields: [
        {
          prop: "key",
          placeholder: isZh ? "通义千问 API Key" : "Qwen API Key",
          link: "https://bailian.console.aliyun.com/",
        },
        {
          prop: "models",
          link: "https://help.aliyun.com/zh/model-studio/models",
        },
      ],
    },
    wenxin: {
      extraFields: [
        {
          prop: "key",
          placeholder: isZh ? "百度智能云千帆 API Key" : "Baidu Qianfan API Key",
          link: "https://cloud.baidu.com/doc/qianfan/s/Kmh4sutww",
        },
        {
          prop: "models",
          link: "https://cloud.baidu.com/doc/qianfan/s/rmh4stp0j",
        },
      ],
    },
  }
}

export const getAISystemConfig = (lang: Language): SystemConfig => ({
  fields: createFields(lang),
  aiList: createAiList(lang),
})
