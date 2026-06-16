// 受支持的界面语言：与主程序 @dootask/tools 的 DooTaskLanguage 一一对应。
// 宿主通过入口 URL 的 ?lang= 传入；不在此列表内的取值一律回退英文。
export const SUPPORTED_LOCALES = [
  'zh',
  'zh-CHT',
  'en',
  'ko',
  'ja',
  'de',
  'fr',
  'id',
  'ru',
] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

// 回退语言：未知 lang、或某条词条所有回退语言都缺译文时，统一回退英文。
export const DEFAULT_LOCALE: Locale = 'en'

const SUPPORTED_SET = new Set<string>(SUPPORTED_LOCALES)

/**
 * 词条取译的回退链（不含末端的 DEFAULT_LOCALE，translate 会自动兜底英文）。
 * 繁体中文缺译文时优先回退到简体中文，而非英文——对中文读者远比英文可读。
 * 其它语言暂无中间回退，缺译文直接落英文。补译某语言后其链路自然命中该语言。
 */
const FALLBACK_CHAIN: Partial<Record<Locale, ReadonlyArray<Locale>>> = {
  'zh-CHT': ['zh'],
}

/** 取某语言的取译顺序：自身 → 中间回退 → 英文。 */
export function localeChain(locale: Locale): ReadonlyArray<Locale> {
  const chain = [locale, ...(FALLBACK_CHAIN[locale] ?? [])]
  if (!chain.includes(DEFAULT_LOCALE)) chain.push(DEFAULT_LOCALE)
  return chain
}

/**
 * 把任意原始 lang 取值规整为受支持的 Locale。
 * - 命中受支持列表（区分大小写，DooTask 传的就是 `zh` / `zh-CHT` 这种）→ 原值。
 * - 否则回退 DEFAULT_LOCALE（英文）。
 * 仅做精确匹配即可满足 DooTask 宿主；不做 `zh-CN`→`zh` 之类的宽松归一，避免歧义。
 */
export function resolveLocale(raw: unknown): Locale {
  if (typeof raw === 'string' && SUPPORTED_SET.has(raw)) return raw as Locale
  return DEFAULT_LOCALE
}

/** <html lang> 用的 BCP-47 标签（与界面语言尽量贴近，便于无障碍/输入法）。 */
export function htmlLang(locale: Locale): string {
  switch (locale) {
    case 'zh':
      return 'zh-CN'
    case 'zh-CHT':
      return 'zh-Hant'
    default:
      return locale
  }
}
