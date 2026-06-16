import { messages } from '#/lib/i18n/messages'
import type { MsgKey, MsgEntry } from '#/lib/i18n/messages'
import { localeChain } from '#/lib/i18n/locale'
import type { Locale } from '#/lib/i18n/locale'

export type TParams = Record<string, string | number>

// {name} 占位插值。无对应参数则原样保留 {name}，便于发现漏传。
function interpolate(text: string, params?: TParams): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in params ? String(params[k]) : m,
  )
}

/**
 * 纯函数翻译：客户端与服务端共用。
 * 取词条在目标语言的译文；该语言缺失时回退英文；词条不存在时回退 key 本身（便于暴露漏配）。
 */
export function translate(
  locale: Locale,
  key: MsgKey,
  params?: TParams,
): string {
  // satisfies 会保留各词条的窄字面量类型，这里按 MsgEntry 读取以便用任意 Locale 索引。
  const entry = messages[key] as MsgEntry | undefined
  if (!entry) return interpolate(String(key), params)
  // 按回退链取第一条有译文的语言（自身 → 中间回退 → 英文）。
  for (const loc of localeChain(locale)) {
    const text = entry[loc]
    if (text != null) return interpolate(text, params)
  }
  return interpolate(entry.en, params)
}

/** 绑定语言后的便捷翻译函数类型。 */
export type TFunc = (key: MsgKey, params?: TParams) => string

/** 生成绑定到某语言的 t()。 */
export function makeT(locale: Locale): TFunc {
  return (key, params) => translate(locale, key, params)
}
