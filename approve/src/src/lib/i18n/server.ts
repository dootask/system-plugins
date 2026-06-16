import { resolveLocale } from '#/lib/i18n/locale'
import { makeT } from '#/lib/i18n/translate'
import type { Locale } from '#/lib/i18n/locale'
import type { TFunc } from '#/lib/i18n/translate'

/**
 * 服务端从请求解析界面语言：优先请求头 `x-lang`（前端 api() 统一带上），
 * 回退查询串 `?lang=`（下载/直链等无法带自定义头的场景），再回退英文。
 *
 * 语义：服务端产出的文案（接口错误、机器人推送卡片）按「触发该请求的用户语言」渲染，
 * 不做按收件人各自语言的差异化（见 REWRITE_PLAN / 国际化方案）。
 */
export function localeFromRequest(request: Request): Locale {
  const header = request.headers.get('x-lang')
  if (header) return resolveLocale(header)
  try {
    return resolveLocale(new URL(request.url).searchParams.get('lang'))
  } catch {
    return resolveLocale(undefined)
  }
}

/** 服务端便捷取 t()：const t = serverT(request); t('key')。 */
export function serverT(request: Request): TFunc {
  return makeT(localeFromRequest(request))
}
