import { getDb } from '#/lib/db'

// 系统设置 key-value 访问层（sys_settings 表）。
// 存 DooTask 审批机器人凭据、推送开关、数据迁移标记等运行期配置。

/** 已知设置键。集中声明便于检索与避免拼写漂移。 */
export const SETTING_KEYS = {
  botToken: 'bot_token',
  botUserId: 'bot_userid',
  botName: 'bot_name',
  notifyEnabled: 'notify_enabled',
  /** M5 一次性 MySQL→SQLite 迁移完成时间（幂等：已迁则跳过）。 */
  migratedAt: 'migrated_at',
  /** M6a 内置模板已播种标记（幂等：已播则跳过）。 */
  builtinSeeded: 'builtin_seeded',
} as const

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM sys_settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row ? row.value : null
}

/** 批量读取，返回 { key: value }（不存在的键不出现在结果里）。 */
export function getSettings(keys: Array<string>): Record<string, string> {
  if (keys.length === 0) return {}
  const placeholders = keys.map(() => '?').join(', ')
  const rows = getDb()
    .prepare(
      `SELECT key, value FROM sys_settings WHERE key IN (${placeholders})`,
    )
    .all(...keys) as Array<{ key: string; value: string }>
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  return out
}

/** 写入（upsert）。value 传 null 表示删除该键。 */
export function setSetting(key: string, value: string | null): void {
  const db = getDb()
  if (value === null) {
    db.prepare('DELETE FROM sys_settings WHERE key = ?').run(key)
    return
  }
  db.prepare(
    `INSERT INTO sys_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).run(key, value)
}

/** 动态推送是否启用：无配置时默认启用。 */
export function isNotifyEnabled(): boolean {
  return getSetting(SETTING_KEYS.notifyEnabled) !== '0'
}

/** 机器人配置（含 token，仅服务端内部使用，勿直接回传前端）。 */
export function getBotConfig(): {
  token: string | null
  userid: number | null
  name: string | null
} {
  const s = getSettings([
    SETTING_KEYS.botToken,
    SETTING_KEYS.botUserId,
    SETTING_KEYS.botName,
  ])
  const useridRaw = s[SETTING_KEYS.botUserId]
  const userid = useridRaw ? Number(useridRaw) : null
  return {
    token: s[SETTING_KEYS.botToken] ?? null,
    userid: Number.isFinite(userid) ? userid : null,
    name: s[SETTING_KEYS.botName] ?? null,
  }
}
