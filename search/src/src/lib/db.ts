/**
 * 三个数据源的懒加载单例连接：
 * - manticore：搜索引擎 SQL 口（compose 网内服务名 search:9306，无鉴权）
 * - mariadb：主程序数据库（内置变量 DB_*）
 * - redis：主程序 Laravel 缓存库（内置变量 REDIS_*，缓存在 db 1）
 */
import mysql from 'mysql2/promise'
import Redis from 'ioredis'

let manticorePool: mysql.Pool | null = null
let mariadbPool: mysql.Pool | null = null
let redisClient: Redis | null = null

export function manticore(): mysql.Pool {
  if (!manticorePool) {
    manticorePool = mysql.createPool({
      host: process.env.SEARCH_HOST || 'search',
      port: parseInt(process.env.SEARCH_PORT || '9306', 10),
      user: 'root', // Manticore 不校验，占位
      connectionLimit: 4,
      // Manticore 对握手里的 CONNECT_WITH_DB 报 "no such database"，必须关掉；
      // 且不支持二进制预处理协议，统一走 query()（文本协议 + 转义）
      flags: ['-CONNECT_WITH_DB'],
      // Manticore 汇报的列字符集不可信（emoji 等 4 字节字符会被 mysql2 解坏），
      // 拿原始字节按 UTF-8 自行解码
      typeCast: (field, next) => {
        if (
          ['VAR_STRING', 'STRING', 'BLOB', 'TINY_BLOB', 'MEDIUM_BLOB', 'LONG_BLOB'].includes(
            field.type,
          )
        ) {
          const buf = field.buffer()
          return buf === null ? null : buf.toString('utf8')
        }
        return next()
      },
    })
  }
  return manticorePool
}

export function mariadb(): mysql.Pool {
  if (!mariadbPool) {
    mariadbPool = mysql.createPool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      charset: 'utf8mb4',
      connectionLimit: 4,
    })
  }
  return mariadbPool
}

export function redis(): Redis {
  if (!redisClient) {
    const password = process.env.REDIS_PASSWORD
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      // 主程序 .env 里 REDIS_PASSWORD=null 是字面量，按无密码处理
      password: password && password !== 'null' ? password : undefined,
      db: parseInt(process.env.REDIS_CACHE_DB || '1', 10),
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    })
  }
  return redisClient
}

/** Manticore 查询（文本协议）。 */
export async function mq<T = Record<string, unknown>>(
  sql: string,
  params: Array<unknown> = [],
): Promise<Array<T>> {
  const [rows] = await manticore().query(sql, params)
  return rows as Array<T>
}

/** 主库查询。 */
export async function dq<T = Record<string, unknown>>(
  sql: string,
  params: Array<unknown> = [],
): Promise<Array<T>> {
  const [rows] = await mariadb().query(sql, params)
  return rows as Array<T>
}
