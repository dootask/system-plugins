import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { DEFAULT_LOCALE, htmlLang, resolveLocale } from '#/lib/i18n/locale'
import type { Locale } from '#/lib/i18n/locale'
import { makeT, translate } from '#/lib/i18n/translate'
import type { TFunc } from '#/lib/i18n/translate'
import { setLocale as setApiLocale } from '#/lib/api'

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

/**
 * 在路由树内提供当前界面语言。
 *
 * 语言来源：宿主在入口 URL 传入的 `?lang=`（权威）。用 useState 初始化器**只读一次**
 * 入口 URL 的 search 并冻结——后续应用内 <Link> 跳转即便丢掉 ?lang 也不影响语言，
 * 同时保证 SSR 首帧与客户端首帧解析出同一语言，规避文案 hydration 不一致。
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const initialSearch = useRouterState({ select: (s) => s.location.search })
  const [locale] = useState<Locale>(() =>
    resolveLocale((initialSearch as { lang?: unknown }).lang),
  )

  // 同步到 api 模块（供 x-lang 头）。在 effect（仅客户端）里写入：api() 会先 await 鉴权门闩，
  // 而门闩在握手完成后才释放，晚于本 effect，故首批请求即可带上正确语言。
  useEffect(() => {
    setApiLocale(locale)
    document.documentElement.lang = htmlLang(locale)
    document.title = translate(locale, 'app.title')
  }, [locale])

  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  )
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}

/** 组件内取翻译函数：const t = useT(); t('app.title')。 */
export function useT(): TFunc {
  const locale = useLocale()
  return useMemo(() => makeT(locale), [locale])
}
