import { createFileRoute } from '@tanstack/react-router'
import { badRequest, forbidden, ok, readJson, requireUser } from '#/lib/auth'
import { localeFromRequest, serverT } from '#/lib/i18n/server'
import { getDb } from '#/lib/db'
import { createDef, listDefs } from '#/lib/repo/defs'
import { BUILTIN_TEMPLATES } from '#/lib/seed/builtin'
import { localizeTemplateName } from '#/lib/seed/i18n'

// 预设模板（内置全套）的浏览与批量导入入口——供「新建模板」页的「模板导入」弹窗使用。
// 与首启播种不同：随时可取、可重复取，不受迁移/已有数据影响。
// GET  /apps/approve/api/admin/presets            → 预设清单（按名标记 exists：是否已存在同名模板）。
// POST /apps/approve/api/admin/presets { keys:[] } → 按 key（预设数组下标）批量建模板，重名照建。
export const Route = createFileRoute('/api/admin/presets')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const auth = await requireUser(request)
        if (auth instanceof Response) return auth
        if (!auth.isAdmin)
          return forbidden(serverT(request)('server.err.adminOnly'))
        const locale = localeFromRequest(request)
        const existingNames = new Set(listDefs().map((d) => d.name))
        const items = BUILTIN_TEMPLATES.map((tpl, i) => {
          const name = localizeTemplateName(tpl.name, locale)
          return {
            key: String(i),
            name,
            category: tpl.category,
            icon: tpl.icon,
            // 已存在：按展示名命中，或与中文原名命中（覆盖首启播种的中文模板）。
            exists: existingNames.has(name) || existingNames.has(tpl.name),
          }
        })
        return ok({ items })
      },
      POST: async ({ request }: { request: Request }) => {
        const auth = await requireUser(request)
        if (auth instanceof Response) return auth
        const t = serverT(request)
        if (!auth.isAdmin) return forbidden(t('server.err.adminOnly'))

        const body = await readJson<{ keys?: Array<string> }>(request)
        // key=预设数组下标，去重 + 过滤越界。
        const indexes = Array.from(new Set(body?.keys ?? []))
          .map((k) => Number(k))
          .filter((n) => Number.isInteger(n) && n >= 0 && n < BUILTIN_TEMPLATES.length)
        if (indexes.length === 0)
          return badRequest(t('server.err.noPresetSelected'))

        // 单事务批量建：仅模板名按请求语言本地化，表单/流程沿用模板原文（入库后可编辑）；
        // createdBy=0（system，同首启播种语义，内置模板不属具体用户）。
        const locale = localeFromRequest(request)
        const created: Array<{ id: number; name: string }> = []
        getDb().transaction(() => {
          for (const i of indexes) {
            const tpl = BUILTIN_TEMPLATES[i]
            const d = createDef(
              {
                name: localizeTemplateName(tpl.name, locale),
                category: tpl.category,
                icon: tpl.icon,
                form_schema: JSON.stringify(tpl.schema),
                flow_nodes: JSON.stringify(tpl.flow),
                sort_order: tpl.sort,
              },
              0,
            )
            created.push({ id: d.id, name: d.name })
          }
        })()

        return ok({ created, count: created.length })
      },
    },
  },
})
