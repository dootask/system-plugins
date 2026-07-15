/**
 * 仪表盘状态聚合：一次 /api/status 汇齐引擎、覆盖率、同步任务、失败队列、向量服务。
 */
import { dq, redis } from '#/lib/db'
import {
  AI_EMBEDDINGS_URL,
  CHECKTIME_REDIS_KEY,
  DATA_TYPES,
  KV_MODEL_KEY,
  KV_POINTER_KEYS,
  KV_SCHEMA_KEY,
  MODEL_REDIS_KEY,
  SYNC_COMMANDS,
  embeddingsApiKey,
  lockRedisKey,
  sourceCountSql,
  failuresTable,
  type DataType,
} from '#/lib/conventions'
import { engineInfo, kvGetAll, tableCount, tableDiskBytes } from '#/lib/engine'

export interface CoverageRow {
  type: DataType
  source: number
  indexed: number
  pointer: number
  maxId: number
  percent: number
  state: 'synced' | 'syncing' | 'missing'
  ratePerMin: number | null
  etaMinutes: number | null
}

export interface SyncTaskRow {
  key: string
  running: boolean
  startedAt: string | null
  ageSec: number | null
  stuck: boolean
}

export interface DashboardStatus {
  now: number
  engine: {
    online: boolean
    version: string
    uptimeSec: number
    diskBytes: number
  }
  vectorService: {
    reachable: boolean
    latencyMs: number | null
    model: string | null
    dims: number | null
    cachedModel: string | null
    storedModel: string | null
    schemaMarker: boolean
  }
  totals: {
    indexed: number
    ratePerMin: number | null
    // 采样历史（写入速率小图用）：每分钟一个点的总索引量
    history: Array<{ t: number; total: number }>
  }
  coverage: Array<CoverageRow>
  syncTasks: Array<SyncTaskRow>
  cron: { lastRunAgoSec: number | null; healthy: boolean }
  failures: {
    total: number
    byType: Record<string, number>
    oldestAgeSec: number | null
  }
}

// ---- 写入速率采样（内存环形缓冲，进程重启清零）----

interface Sample {
  t: number
  counts: Record<DataType, number>
}
const samples: Array<Sample> = []
const SAMPLE_MIN_INTERVAL_MS = 55_000
const SAMPLE_WINDOW_MS = 30 * 60_000

function recordSample(counts: Record<DataType, number>) {
  const now = Date.now()
  const last = samples[samples.length - 1]
  if (last && now - last.t < SAMPLE_MIN_INTERVAL_MS) return
  samples.push({ t: now, counts })
  while (samples.length && samples[0].t < now - SAMPLE_WINDOW_MS) samples.shift()
}

function ratePerMin(type: DataType | 'total'): number | null {
  if (samples.length < 2) return null
  const first = samples[0]
  const last = samples[samples.length - 1]
  const minutes = (last.t - first.t) / 60_000
  if (minutes < 0.5) return null
  const sum = (s: Sample) =>
    type === 'total'
      ? DATA_TYPES.reduce((acc, t) => acc + Math.max(0, s.counts[t]), 0)
      : Math.max(0, s.counts[type])
  return Math.max(0, Math.round((sum(last) - sum(first)) / minutes))
}

// ---- ai 向量服务探测（60 秒缓存）----

interface AiProbe {
  reachable: boolean
  latencyMs: number | null
  model: string | null
  dims: number | null
}
let aiProbeCache: { probe: AiProbe; exp: number } | null = null

async function probeAi(): Promise<AiProbe> {
  if (aiProbeCache && aiProbeCache.exp > Date.now()) return aiProbeCache.probe
  const started = Date.now()
  let probe: AiProbe = { reachable: false, latencyMs: null, model: null, dims: null }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(AI_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${embeddingsApiKey()}`,
      },
      body: JSON.stringify({ input: ['ping'] }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (res.ok) {
      const body = (await res.json()) as {
        model?: string
        data?: Array<{ embedding?: Array<number> } | Array<number>>
      }
      const first = body.data?.[0]
      const vec = Array.isArray(first)
        ? first
        : (first as { embedding?: Array<number> } | undefined)?.embedding
      probe = {
        reachable: true,
        latencyMs: Date.now() - started,
        model: body.model || null,
        dims: Array.isArray(vec) ? vec.length : null,
      }
    }
  } catch {
    /* 不可达 */
  }
  aiProbeCache = { probe, exp: Date.now() + 60_000 }
  return probe
}

// ---- Laravel 缓存值解析 ----

/** Laravel Redis 缓存的字符串值是 PHP serialize 格式（s:N:"...";），数值原样存。 */
function phpScalar(raw: string | null): string | null {
  if (raw == null) return null
  const m = raw.match(/^s:\d+:"([\s\S]*)";$/)
  if (m) return m[1]
  const i = raw.match(/^i:(-?\d+);$/)
  if (i) return i[1]
  return raw
}

// ---- 锁状态 ----

function parseLockStartedAt(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.match(/started_at";s:\d+:"([^"]+)"/)
  return m ? m[1] : null
}

async function syncTaskRows(): Promise<Array<SyncTaskRow>> {
  const r = redis()
  const keys = SYNC_COMMANDS.map((c) => lockRedisKey(c.signature))
  const values = await r.mget(...keys)
  const now = Date.now()
  return SYNC_COMMANDS.map((c, i) => {
    const startedAt = parseLockStartedAt(values[i])
    if (!startedAt) {
      return { key: c.key, running: false, startedAt: null, ageSec: null, stuck: false }
    }
    // started_at 为主程序时区（容器 TZ 与之对齐，见 docker-compose TZ）
    const ageSec = Math.max(0, Math.round((now - new Date(startedAt.replace(' ', 'T')).getTime()) / 1000))
    // 正常同步每批（秒级）都会刷新 started_at，超过 10 分钟没刷 = 进程已死、锁残留
    return { key: c.key, running: true, startedAt, ageSec, stuck: ageSec > 600 }
  })
}

// ---- 主入口 ----

export async function getStatus(): Promise<DashboardStatus> {
  const r = redis()

  const [engine, kv, aiProbe, cachedModel, checkTimeRaw, sync, failures, ...perType] =
    await Promise.all([
      engineInfo().then(
        (info) => ({ online: true, ...info }),
        () => ({ online: false, uptimeSec: 0, version: '' }),
      ),
      kvGetAll().catch(() => ({}) as Record<string, string>),
      probeAi(),
      r.get(MODEL_REDIS_KEY).catch(() => null),
      r.get(CHECKTIME_REDIS_KEY).catch(() => null),
      syncTaskRows().catch(() =>
        SYNC_COMMANDS.map((c) => ({
          key: c.key,
          running: false,
          startedAt: null,
          ageSec: null,
          stuck: false,
        })),
      ),
      failureSummary(),
      ...DATA_TYPES.map(async (type) => {
        const [indexed, src, disk] = await Promise.all([
          tableCount(type),
          dq<{ c: number; max_id: number }>(sourceCountSql(type)).then((rows) => rows[0]),
          tableDiskBytes(type),
        ])
        return { type, indexed, source: Number(src?.c ?? 0), maxId: Number(src?.max_id ?? 0), disk }
      }),
    ])

  const typeRows = perType as Array<{
    type: DataType
    indexed: number
    source: number
    maxId: number
    disk: number
  }>

  recordSample(
    Object.fromEntries(typeRows.map((t) => [t.type, t.indexed])) as Record<DataType, number>,
  )

  const coverage: Array<CoverageRow> = typeRows.map((t) => {
    const pointer = parseInt(kv[KV_POINTER_KEYS[t.type]] || '0', 10)
    const missing = t.indexed < 0
    const gap = Math.max(0, t.maxId - pointer)
    const syncing = gap > 200
    const rate = ratePerMin(t.type)
    const remaining = Math.max(0, t.source - Math.max(0, t.indexed))
    return {
      type: t.type,
      source: t.source,
      indexed: Math.max(0, t.indexed),
      pointer,
      maxId: t.maxId,
      percent: t.source > 0 ? Math.min(100, Math.round((Math.max(0, t.indexed) / t.source) * 100)) : 100,
      state: missing ? 'missing' : syncing ? 'syncing' : 'synced',
      ratePerMin: rate,
      etaMinutes: syncing && rate && rate > 0 ? Math.round(remaining / rate) : null,
    }
  })

  // CheckTime：Laravel 存 unix 时间戳（数值原样进 Redis）
  const checkTime = checkTimeRaw ? parseInt(String(checkTimeRaw).replace(/\D/g, ''), 10) : 0
  const lastRunAgoSec = checkTime > 0 ? Math.max(0, Math.round(Date.now() / 1000 - checkTime)) : null

  return {
    now: Date.now(),
    engine: {
      online: engine.online,
      version: engine.version,
      uptimeSec: engine.uptimeSec,
      diskBytes: typeRows.reduce((acc, t) => acc + t.disk, 0),
    },
    vectorService: {
      reachable: aiProbe.reachable,
      latencyMs: aiProbe.latencyMs,
      model: aiProbe.model,
      dims: aiProbe.dims,
      cachedModel: phpScalar(cachedModel),
      storedModel: kv[KV_MODEL_KEY] || null,
      schemaMarker: Boolean(kv[KV_SCHEMA_KEY]),
    },
    totals: {
      indexed: typeRows.reduce((acc, t) => acc + Math.max(0, t.indexed), 0),
      ratePerMin: ratePerMin('total'),
      history: samples.map((s) => ({
        t: s.t,
        total: DATA_TYPES.reduce((acc, t) => acc + Math.max(0, s.counts[t]), 0),
      })),
    },
    coverage,
    syncTasks: sync,
    // 同步调度节流为 2 分钟一轮，超过 6 分钟没跑视为 cron 异常
    cron: { lastRunAgoSec, healthy: lastRunAgoSec !== null && lastRunAgoSec < 360 },
    failures,
  }
}

async function failureSummary(): Promise<DashboardStatus['failures']> {
  try {
    const [totals, oldest] = await Promise.all([
      dq<{ data_type: string; c: number }>(
        `SELECT data_type, COUNT(*) AS c FROM ${failuresTable()} GROUP BY data_type`,
      ),
      dq<{ age: number }>(
        `SELECT TIMESTAMPDIFF(SECOND, MIN(created_at), NOW()) AS age FROM ${failuresTable()}`,
      ),
    ])
    const byType = Object.fromEntries(totals.map((t) => [t.data_type, Number(t.c)]))
    return {
      total: totals.reduce((acc, t) => acc + Number(t.c), 0),
      byType,
      oldestAgeSec: oldest[0]?.age != null ? Number(oldest[0].age) : null,
    }
  } catch {
    return { total: 0, byType: {}, oldestAgeSec: null }
  }
}
