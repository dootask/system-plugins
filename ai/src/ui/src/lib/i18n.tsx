import { useMemo, type ReactNode } from "react"

import { detectLanguage, translateInternal } from "./i18n-core"
import { I18nContext } from "./i18n-context"

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const lang = useMemo(() => detectLanguage(), [])
  const value = useMemo(
    () => ({
      lang,
      t: (key: string) => translateInternal(lang, key),
    }),
    [lang],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
