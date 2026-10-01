/**
 * Manticore 引擎访问：key_values 读写、表统计、测试台查询。
 */
import { crc32 } from 'node:zlib'
import { mq } from '#/lib/db'
import {
  PK_COLUMNS,
  SNIPPET_COLUMNS,
  VECTOR_TABLES,
  type DataType,
} from '#/lib/conventions'

// ---- key_values（与主程序 ManticoreKeyValue 同格式：id = crc32(key)）----

export async function kvGet(key: string): Promise<string | null> {
  const rows = await mq<{ v: string }>('SELECT v FROM key_values WHERE k = ?', [key])
  return rows.length ? rows[0].v : null
}

export async function kvGetAll(): Promise<Record<string, string>> {
  const rows = await mq<{ k: string; v: string }>('SELECT k, v FROM key_values LIMIT 1000')
  return Object.fromEntries(rows.map((r) => [r.k, r.v]))
}

export async function kvSet(key: string, value: string): Promise<void> {
  await mq('DELETE FROM key_values WHERE k = ?', [key])
  await mq('INSERT INTO key_values (id, k, v) VALUES (?, ?, ?)', [
    crc32(key) >>> 0,
    key,
    value,
  ])
}

export async function kvDel(key: string): Promise<void> {
  await mq('DELETE FROM key_values WHERE k = ?', [key])
}

// ---- 表统计 ----

/** 引擎里当前登记的表名集合；引擎连不上返回 null */
export async function engineTables(): Promise<Set<string> | null> {
  try {
    const rows = await mq<{ Table: string }>('SHOW TABLES')
    return new Set(rows.map((r) => r.Table))
  } catch {
    return null
  }
}

/** 返回行数；查询失败返回 -1（原因由调用方结合 engineTables() 判定：离线 / 未加载 / 缺失） */
export async function tableCount(type: DataType): Promise<number> {
  try {
    const rows = await mq<{ c: number }>(
      `SELECT COUNT(*) AS c FROM ${VECTOR_TABLES[type]}`,
    )
    return Number(rows[0]?.c ?? 0)
  } catch {
    return -1
  }
}

export async function tableDiskBytes(type: DataType): Promise<number> {
  try {
    const rows = await mq<{ Variable_name: string; Value: string }>(
      `SHOW TABLE ${VECTOR_TABLES[type]} STATUS`,
    )
    const row = rows.find((r) => r.Variable_name === 'disk_bytes')
    return row ? Number(row.Value) : 0
  } catch {
    return 0
  }
}

export async function engineInfo(): Promise<{ uptimeSec: number; version: string }> {
  const status = await mq<{ Counter: string; Value: string }>('SHOW STATUS')
  const get = (k: string) => status.find((r) => r.Counter === k)?.Value || ''
  return {
    uptimeSec: Number(get('uptime') || 0),
    // 完整串形如 "28.4.4 f63d06ecb@... (columnar ...) ..."，只取版本号
    version: (get('version') || '').split(' ')[0],
  }
}

export async function truncateTable(type: DataType): Promise<void> {
  await mq(`TRUNCATE TABLE ${VECTOR_TABLES[type]}`)
}

// ---- 测试台 ----

export interface TestHit {
  id: number
  snippet: string
  score: number
  source: 'fulltext' | 'vector' | 'both'
}

function escapeMatch(q: string): string {
  // 剥掉 Manticore 全文查询语法字符，按普通词处理
  return q.replace(/["'\\()|\-!@~&/^$<>=?*]/g, ' ').trim()
}

export async function searchTest(
  type: DataType,
  query: string,
  mode: 'fulltext' | 'vector' | 'hybrid',
): Promise<Array<TestHit>> {
  const table = VECTOR_TABLES[type]
  const pk = PK_COLUMNS[type]
  const snippet = SNIPPET_COLUMNS[type]
  const limit = 10

  const runFulltext = async (): Promise<Array<TestHit>> => {
    const m = escapeMatch(query)
    if (!m) return []
    const rows = await mq<Record<string, unknown>>(
      `SELECT ${pk} AS pk, ${snippet} AS snippet, WEIGHT() AS w FROM ${table} WHERE MATCH(?) LIMIT ${limit}`,
      [m],
    )
    return rows.map((r) => ({
      id: Number(r.pk),
      snippet: String(r.snippet ?? ''),
      score: Number(r.w),
      source: 'fulltext' as const,
    }))
  }

  const runVector = async (): Promise<Array<TestHit>> => {
    // Auto Embeddings 表支持 KNN 直接传查询文本，由引擎调 ai 插件现算查询向量
    const rows = await mq<Record<string, unknown>>(
      `SELECT ${pk} AS pk, ${snippet} AS snippet, knn_dist() AS d FROM ${table} WHERE knn(content_vector, ${limit}, ?) LIMIT ${limit}`,
      [query],
    )
    return rows.map((r) => ({
      id: Number(r.pk),
      snippet: String(r.snippet ?? ''),
      score: Math.max(0, 1 - Number(r.d)), // cosine 距离 → 相似度
      source: 'vector' as const,
    }))
  }

  if (mode === 'fulltext') return runFulltext()
  if (mode === 'vector') return runVector()

  // hybrid：与主程序一致的 RRF 融合（k=60）
  const [ft, vt] = await Promise.all([
    runFulltext().catch(() => [] as Array<TestHit>),
    runVector().catch(() => [] as Array<TestHit>),
  ])
  const K = 60
  const merged = new Map<number, TestHit & { rrf: number }>()
  ft.forEach((h, i) => merged.set(h.id, { ...h, rrf: 1 / (K + i + 1) }))
  vt.forEach((h, i) => {
    const prev = merged.get(h.id)
    if (prev) {
      prev.rrf += 1 / (K + i + 1)
      prev.source = 'both'
      prev.score = Math.max(prev.score, h.score)
    } else {
      merged.set(h.id, { ...h, rrf: 1 / (K + i + 1) })
    }
  })
  return [...merged.values()]
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, limit)
    .map(({ rrf: _rrf, ...h }) => h)
}
