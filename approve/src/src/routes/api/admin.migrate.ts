import { createFileRoute } from '@tanstack/react-router'
import { forbidden, ok, readJson, requireUser } from '#/lib/auth'
import { serverT } from '#/lib/i18n/server'
import { getDb } from '#/lib/db'
import {
  alreadyMigrated,
  createMysqlSource,
  mysqlConfigFromEnv,
  runMigration,
} from '#/lib/migrate'

// 管理员手动触发旧库 → SQLite 迁移（首启 hook 之外的备用入口，便于失败重跑）。
// GET  /apps/approve/api/admin/migrate        → 查询迁移状态（是否已迁、是否配置旧库）。
// POST /apps/approve/api/admin/migrate { force?: boolean } → 执行迁移（force 可重跑）。
export const Route = createFileRoute('/api/admin/migrate')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const auth = await requireUser(request)
        if (auth instanceof Response) return auth
        if (!auth.isAdmin) return forbidden(serverT(request)('server.err.adminOnly'))
        return ok({
          migrated: alreadyMigrated(getDb()),
          legacyConfigured: !!mysqlConfigFromEnv(),
        })
      },
      POST: async ({ request }: { request: Request }) => {
        const auth = await requireUser(request)
        if (auth instanceof Response) return auth
        if (!auth.isAdmin) return forbidden(serverT(request)('server.err.adminOnly'))

        const cfg = mysqlConfigFromEnv()
        if (!cfg)
          return ok({ migrated: false, reason: 'legacy-not-configured' })

        const body = await readJson<{ force?: boolean }>(request)
        const force = body?.force === true

        const source = await createMysqlSource(cfg)
        try {
          const result = await runMigration(source, getDb(), force)
          return ok(result)
        } finally {
          await source.close().catch(() => {})
        }
      },
    },
  },
})
