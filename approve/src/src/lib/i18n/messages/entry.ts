import type { Locale } from '#/lib/i18n/locale'

/**
 * 单条词条：必须给出 zh 与 en（en 是回退语言），其余语言可选、缺失时回退英文。
 * 将来补译只需给某条加上 `ko: '...'` 等字段，无需改任何框架代码。
 */
export type MsgEntry = { zh: string; en: string } & Partial<
  Record<Locale, string>
>

/** 约束某个词条模块的形状，同时保留 key 的字面量类型（供 MsgKey 联合）。 */
export type MsgModule = Record<string, MsgEntry>
