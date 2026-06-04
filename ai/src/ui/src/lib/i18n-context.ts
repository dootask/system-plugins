import { createContext, useContext } from "react"

import { FALLBACK_LANGUAGE, translateInternal, type Language } from "./i18n-core"

export const I18nContext = createContext<{
  lang: Language
  t: (key: string) => string
}>({
  lang: FALLBACK_LANGUAGE,
  t: (key: string) => translateInternal(FALLBACK_LANGUAGE, key),
})

export const useI18n = () => useContext(I18nContext)
