/** M5 数据迁移对外入口（旧 MySQL → 本插件 SQLite）。 */
export { ensureMigrated, runMigration, alreadyMigrated } from './migrate'
export type { MigrationResult } from './migrate'
export { createMysqlSource, mysqlConfigFromEnv } from './mysql-source'
export type { MysqlConfig } from './mysql-source'
export type { LegacySource } from './legacy-types'
