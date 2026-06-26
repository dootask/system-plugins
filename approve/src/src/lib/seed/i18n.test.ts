/**
 * 内置模板「模板名」本地化测试：
 *  1. en：每个内置模板名都有英文译文（本地化到 en 后不残留中文）。
 *  2. zh：保持原中文名。
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_TEMPLATES } from './builtin'
import { localizeTemplateName } from './i18n'

const CJK = /[一-鿿]/

describe('内置模板名本地化', () => {
  it('en 每个模板名都有英文译文', () => {
    for (const tpl of BUILTIN_TEMPLATES) {
      const en = localizeTemplateName(tpl.name, 'en')
      expect(CJK.test(en), `模板「${tpl.name}」缺英文名`).toBe(false)
    }
  })

  it('zh 保持原中文名', () => {
    for (const tpl of BUILTIN_TEMPLATES) {
      expect(localizeTemplateName(tpl.name, 'zh')).toBe(tpl.name)
    }
  })
})
