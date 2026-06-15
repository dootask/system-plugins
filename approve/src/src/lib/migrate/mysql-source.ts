/**
 * 旧 MySQL 库的**只读** LegacySource 实现（mysql2，动态 import 以免常驻依赖）。
 *
 * 连接信息取自 docker-compose 注入的 env：DB_HOST/DB_PORT/DB_DATABASE/DB_USERNAME/
 * DB_PASSWORD，表前缀 `${DB_PREFIX}approve_`（如 pre_approve_）。
 * 只 SELECT，不写老库。运行表查不到时回退历史表（_history）。
 */
import type {
  LegacyExecution,
  LegacyIdentitylink,
  LegacyProcInst,
  LegacyProcdef,
  LegacySource,
  LegacyTask,
} from './legacy-types'

export interface MysqlConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  /** 完整业务表前缀，如 `pre_approve_`。 */
  prefix: string
}

/** 从环境变量读旧库连接配置；缺关键项返回 null（无可迁移源）。 */
export function mysqlConfigFromEnv(): MysqlConfig | null {
  const host = process.env.DB_HOST
  const database = process.env.DB_DATABASE
  const user = process.env.DB_USERNAME
  if (!host || !database || !user) return null
  const dbPrefix = process.env.DB_PREFIX ?? ''
  return {
    host,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    database,
    user,
    password: process.env.DB_PASSWORD || '',
    prefix: `${dbPrefix}approve_`,
  }
}

/** 创建只读 MySQL 源。需要 mysql2 已安装；连接失败抛错（由调用方捕获并记日志）。 */
export async function createMysqlSource(
  cfg: MysqlConfig,
): Promise<LegacySource> {
  // 动态 import：平时不连库时不加载 mysql2。
  const mysql = await import('mysql2/promise')
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    // 只读会话；不开多语句，规避注入面。
    multipleStatements: false,
  })
  const p = cfg.prefix

  async function q<T>(
    sql: string,
    params: Array<unknown> = [],
  ): Promise<Array<T>> {
    const [rows] = await conn.query(sql, params)
    return rows as Array<T>
  }

  return {
    async procdefs() {
      return q<LegacyProcdef>(`SELECT * FROM \`${p}procdef\``)
    },

    async procInsts() {
      // 运行表 + 历史表合并（两表结构相同）。表不存在时各自兜底空集。
      const running = await q<LegacyProcInst>(
        `SELECT * FROM \`${p}proc_inst\``,
      ).catch(() => [] as Array<LegacyProcInst>)
      const history = await q<LegacyProcInst>(
        `SELECT * FROM \`${p}proc_inst_history\``,
      ).catch(() => [] as Array<LegacyProcInst>)
      // 同 id 以运行表为准（仍在跑的实例）。
      const seen = new Set(running.map((r) => r.id))
      return [...running, ...history.filter((h) => !seen.has(h.id))]
    },

    async executionByInst(procInstId: number) {
      const rows = await q<LegacyExecution>(
        `SELECT * FROM \`${p}execution\` WHERE proc_inst_id = ? LIMIT 1`,
        [procInstId],
      ).catch(() => [] as Array<LegacyExecution>)
      if (rows[0]) return rows[0]
      const his = await q<LegacyExecution>(
        `SELECT * FROM \`${p}execution_history\` WHERE proc_inst_id = ? LIMIT 1`,
        [procInstId],
      ).catch(() => [] as Array<LegacyExecution>)
      return his[0]
    },

    async tasksByInst(procInstId: number) {
      const run = await q<LegacyTask>(
        `SELECT * FROM \`${p}task\` WHERE proc_inst_id = ? ORDER BY id ASC`,
        [procInstId],
      ).catch(() => [] as Array<LegacyTask>)
      const his = await q<LegacyTask>(
        `SELECT * FROM \`${p}task_history\` WHERE proc_inst_id = ? ORDER BY id ASC`,
        [procInstId],
      ).catch(() => [] as Array<LegacyTask>)
      const seen = new Set(run.map((r) => r.id))
      return [...run, ...his.filter((h) => !seen.has(h.id))]
    },

    async identitylinksByInst(procInstId: number) {
      const run = await q<LegacyIdentitylink>(
        `SELECT * FROM \`${p}identitylink\` WHERE proc_inst_id = ? ORDER BY id ASC`,
        [procInstId],
      ).catch(() => [] as Array<LegacyIdentitylink>)
      const his = await q<LegacyIdentitylink>(
        `SELECT * FROM \`${p}identitylink_history\` WHERE proc_inst_id = ? ORDER BY id ASC`,
        [procInstId],
      ).catch(() => [] as Array<LegacyIdentitylink>)
      const seen = new Set(run.map((r) => r.id))
      return [...run, ...his.filter((h) => !seen.has(h.id))]
    },

    async close() {
      await conn.end()
    },
  }
}
