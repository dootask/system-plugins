/**
 * 与 DooTask 主程序的内部约定登记（唯一耦合点）
 *
 * 本仪表盘走「插件直连」模型：引擎数据直连 search:9306，失败表直连主库，
 * 同步锁/模型缓存直读主程序 Redis。所有依赖主程序内部实现的常量集中在此，
 * 主程序侧改动（命令签名、缓存前缀、表名等）只需同步更新本文件。
 *
 * 对应主程序源码（kuaifan/dootask，branch pro）：
 * - 锁键：app/Console/Commands/Traits/ManticoreSyncLock.php —— Cache::put(md5($signature), ...)
 * - 缓存前缀：config/database.php redis.options.prefix + config/cache.php prefix
 * - 指针/标记：app/Module/Manticore/ManticoreBase.php（key_values 表）
 * - 可索引过滤条件：app/Console/Commands/Sync*ToManticore.php
 */
import { createHash } from 'node:crypto'

export type DataType = 'msg' | 'file' | 'task' | 'project' | 'user'

export const DATA_TYPES: Array<DataType> = ['msg', 'file', 'task', 'project', 'user']

// ---- Redis（主程序 Laravel 缓存，db 1）----

// 完整键 = REDIS_OPTIONS_PREFIX + CACHE_PREFIX + 键名（无分隔符），实测：
// dootask_database_dootask_cacheManticoreSyncTask:CheckTime
export const CACHE_KEY_PREFIX =
  process.env.CACHE_KEY_PREFIX || 'dootask_database_dootask_cache'

// 同步命令锁：Cache::put(md5($signature), ['started_at' => 'Y-m-d H:i:s'], 1800)
// 签名字符串必须与主程序 $signature 一字不差（md5 是键）。
export const SYNC_COMMANDS: Array<{
  key: string
  signature: string
}> = [
  { key: 'msg', signature: 'manticore:sync-msgs {--f} {--i} {--c} {--batch=100} {--dialog=} {--sleep=3}' },
  { key: 'file', signature: 'manticore:sync-files {--f} {--i} {--c} {--batch=100} {--sleep=3}' },
  { key: 'task', signature: 'manticore:sync-tasks {--f} {--i} {--c} {--batch=100} {--sleep=3}' },
  { key: 'project', signature: 'manticore:sync-projects {--f} {--i} {--c} {--batch=100} {--sleep=3}' },
  { key: 'user', signature: 'manticore:sync-users {--f} {--i} {--c} {--batch=100} {--sleep=3}' },
  { key: 'retry', signature: 'manticore:retry-failures {--limit=100 : 每次处理的最大数量} {--stats : 显示统计信息}' },
]

export function lockRedisKey(signature: string): string {
  return CACHE_KEY_PREFIX + createHash('md5').update(signature).digest('hex')
}

// 同步调度节流标记（ManticoreSyncTask），值为时间戳；用作 cron 心跳。
export const CHECKTIME_REDIS_KEY = CACHE_KEY_PREFIX + 'ManticoreSyncTask:CheckTime'

// 查询侧维护的当前 embedding 模型（AI.php requestPluginEmbeddings → Cache::forever）
export const MODEL_REDIS_KEY = CACHE_KEY_PREFIX + 'ai:embedding_model'

// ---- Manticore key_values 表（同步指针与表结构标记）----

export const KV_POINTER_KEYS: Record<DataType, string> = {
  msg: 'sync:manticoreMsgLastId',
  file: 'sync:manticoreFileLastId',
  task: 'sync:manticoreTaskLastId',
  project: 'sync:manticoreProjectLastId',
  user: 'sync:manticoreUserLastId',
}

export const KV_SCHEMA_KEY = 'vector:schema'
export const KV_MODEL_KEY = 'vector:model'

// ---- Manticore 向量表 ----

export const VECTOR_TABLES: Record<DataType, string> = {
  msg: 'msg_vectors',
  file: 'file_vectors',
  task: 'task_vectors',
  project: 'project_vectors',
  user: 'user_vectors',
}

// 测试台结果展示用的文本列（每类的主内容字段）
export const SNIPPET_COLUMNS: Record<DataType, string> = {
  msg: 'content',
  file: 'file_name',
  task: 'task_name',
  project: 'project_name',
  user: 'nickname',
}

// user_vectors 主键列为 userid，其余为 id
export const PK_COLUMNS: Record<DataType, string> = {
  msg: 'id',
  file: 'id',
  task: 'id',
  project: 'id',
  user: 'userid',
}

// ---- 主库（MariaDB）----

const P = () => process.env.DB_PREFIX || ''

// 「可索引数据」过滤条件：与主程序 Sync*ToManticore 命令的 WHERE 完全一致
// （软删模型 Eloquent 隐式带 deleted_at IS NULL，这里显式写出）。
export function sourceCountSql(type: DataType): string {
  const p = P()
  switch (type) {
    case 'msg':
      return (
        `SELECT COUNT(*) AS c, COALESCE(MAX(id),0) AS max_id FROM ${p}web_socket_dialog_msgs ` +
        `WHERE deleted_at IS NULL AND bot != 1 AND \`key\` IS NOT NULL AND \`key\` != '' ` +
        `AND type IN ('text','file','record','meeting','vote')`
      )
    case 'file':
      // 52428800 = ManticoreFile::MAX_FILE_SIZE 最大档（office 50MB）
      return (
        `SELECT COUNT(*) AS c, COALESCE(MAX(id),0) AS max_id FROM ${p}files ` +
        `WHERE deleted_at IS NULL AND type != 'folder' AND size <= 52428800`
      )
    case 'task':
      return (
        `SELECT COUNT(*) AS c, COALESCE(MAX(id),0) AS max_id FROM ${p}project_tasks ` +
        `WHERE archived_at IS NULL AND deleted_at IS NULL`
      )
    case 'project':
      return (
        `SELECT COUNT(*) AS c, COALESCE(MAX(id),0) AS max_id FROM ${p}projects ` +
        `WHERE archived_at IS NULL AND deleted_at IS NULL`
      )
    case 'user':
      return (
        `SELECT COUNT(*) AS c, COALESCE(MAX(userid),0) AS max_id FROM ${p}users ` +
        `WHERE bot = 0 AND disable_at IS NULL`
      )
  }
}

export function failuresTable(): string {
  return `${P()}manticore_sync_failures`
}

export function usersTable(): string {
  return `${P()}users`
}

// ---- ai 插件（向量服务）----

export const AI_EMBEDDINGS_URL =
  process.env.AI_EMBEDDINGS_URL || 'http://ai:5001/embeddings'

// 派生密钥：与主程序 ManticoreBase::embeddingsApiKey() / ai 插件 main.py 同一算法
export function embeddingsApiKey(): string {
  const appKey = process.env.APP_KEY || ''
  return createHash('sha256').update(`${appKey}:embeddings`).digest('hex')
}

// ---- 失败重试退避（ManticoreSyncFailure::getPendingRetries 的间隔表）----

export function nextRetryDelayMinutes(retryCount: number): number {
  if (retryCount <= 0) return 0
  if (retryCount === 1) return 1
  if (retryCount === 2) return 5
  if (retryCount === 3) return 15
  return 30
}
