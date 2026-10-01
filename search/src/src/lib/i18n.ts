/**
 * 轻量国际化：中文（zh、zh-TW、zh-HK、zh-CN…一律简体中文）/ 其他 → 英文。
 * 语言来自菜单 url 传入的 ?lang={system_lang}，SSR 与客户端同源（请求 URL），无水合错位。
 */

export type Locale = 'zh' | 'en'

export function resolveLocale(lang: string | undefined | null): Locale {
  return (lang || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

const zh = {
  title: '搜索状态',
  engineOnline: '引擎在线',
  engineOffline: '引擎离线',
  autoRefresh: '{n} 秒后刷新',
  loadFailed: '加载失败',
  notAdmin: '此页面仅管理员可用',
  unauthorized: '身份验证失败，请在 DooTask 内以管理员身份打开',

  // 总览卡
  cardEngine: '搜索引擎',
  cardVector: '向量服务（AI 助手）',
  cardIndexed: '已索引数据',
  cardFailures: '失败待重试',
  ok: '正常',
  unreachable: '不可达',
  up: '运行',
  disk: '磁盘',
  dims: '维',
  unit: '条',
  perMinNow: '最近速率 +{n}/分',
  oldestAgo: '最早一条 {t} 前',
  autoRetrying: '自动重试中',
  noFailures: '无堆积',
  modelMismatch: '模型不一致，将触发重建',

  // 索引覆盖
  coverage: '索引覆盖',
  coverageHint: '源数据 vs 已索引',
  colType: '类型',
  colSource: '源数据',
  colIndexed: '已索引',
  colCoverage: '覆盖率',
  colState: '状态',
  synced: '已追平',
  syncing: '同步中',
  missing: '表缺失',
  stateOffline: '引擎离线',
  stateUnloaded: '表未加载',
  rowsPerMin: '{n} 行/分',
  etaAbout: '预计 {t}',
  refill: '重灌',
  writeRate: '写入速率（近 30 分钟）',
  typeMsg: '消息',
  typeFile: '文件',
  typeTask: '任务',
  typeProject: '项目',
  typeUser: '用户',

  // 同步任务
  syncTasks: '同步任务',
  cronHeartbeat: '调度心跳：{t}前',
  cronStale: '调度异常（{t}没跑）',
  cronUnknown: '调度心跳：未知',
  running: '运行中 · {t}',
  idle: '空闲',
  stuck: '疑似卡死 · 持锁 {t}',
  clearLocks: '清理卡锁',
  clearLocksDone: '已清理 {n} 个锁，同步将在 1 分钟内恢复',
  taskMsg: '消息同步',
  taskFile: '文件同步',
  taskTask: '任务同步',
  taskProject: '项目同步',
  taskUser: '用户同步',
  taskRetry: '失败重试任务',

  // 失败队列
  failureQueue: '失败队列',
  retryAll: '全部立即重试',
  retryAllDone: '已加入重试队列，1 分钟内开始重试',
  retry: '重试',
  del: '删除',
  emptyQueue: '无失败记录',
  retriedTimes: '已重试 {n} 次',
  nextRetryIn: '下次约 {n} 分钟后',
  nextRetryNow: '即将重试',
  actionSync: '写入',
  actionDelete: '删除',

  // 测试台
  searchTest: '搜索测试台',
  searchTestHint: '以管理员视角直接查引擎，排查「为什么搜不到」',
  queryPlaceholder: '输入查询词…',
  search: '搜索',
  modeHybrid: '混合',
  modeFulltext: '全文',
  modeVector: '语义（向量）',
  srcFulltext: '全文',
  srcVector: '语义',
  srcBoth: '全文+语义',
  noHits: '无命中',
  tookMs: '耗时 {n}ms',

  // 危险操作
  dangerZone: '危险操作',
  rebuildTitle: '全量重建索引',
  rebuildDesc: '清空全部 5 类索引并从源数据重灌，期间搜索结果不完整（预计数小时）。',
  rebuildBtn: '重建…',
  rebuildAgainTitle: '再次确认',
  rebuildAgainDesc: '将立即清空全部 5 类索引并从源数据重灌，期间搜索结果不完整。确定继续？',
  rebuildStarted: '重建已触发，主程序将在 2 分钟内开始',
  refillConfirmTitle: '重灌「{type}」索引？',
  refillConfirmDesc: '将清空该类型索引并从源数据重新灌入（同步在 2 分钟内开始），期间该类型的搜索结果不完整。',
  refillStarted: '重灌已触发',
  confirm: '确认',
  cancel: '取消',

  adminOnly: '搜索状态面板 · 仅管理员可见',
}

const en: typeof zh = {
  title: 'Search Status',
  engineOnline: 'Engine online',
  engineOffline: 'Engine offline',
  autoRefresh: 'Refresh in {n}s',
  loadFailed: 'Failed to load',
  notAdmin: 'This page is for administrators only',
  unauthorized: 'Authentication failed. Open this app inside DooTask as an administrator.',

  cardEngine: 'Search engine',
  cardVector: 'Vector service (AI Assistant)',
  cardIndexed: 'Indexed documents',
  cardFailures: 'Pending retries',
  ok: 'OK',
  unreachable: 'Unreachable',
  up: 'up',
  disk: 'disk',
  dims: 'dims',
  unit: 'docs',
  perMinNow: '+{n}/min recently',
  oldestAgo: 'oldest {t} ago',
  autoRetrying: 'auto-retrying',
  noFailures: 'no backlog',
  modelMismatch: 'Model changed, rebuild will trigger',

  coverage: 'Index coverage',
  coverageHint: 'source vs indexed',
  colType: 'Type',
  colSource: 'Source',
  colIndexed: 'Indexed',
  colCoverage: 'Coverage',
  colState: 'State',
  synced: 'Synced',
  syncing: 'Syncing',
  missing: 'Table missing',
  stateOffline: 'Engine offline',
  stateUnloaded: 'Table not loaded',
  rowsPerMin: '{n} rows/min',
  etaAbout: 'ETA {t}',
  refill: 'Refill',
  writeRate: 'Write rate (last 30 min)',
  typeMsg: 'Messages',
  typeFile: 'Files',
  typeTask: 'Tasks',
  typeProject: 'Projects',
  typeUser: 'Users',

  syncTasks: 'Sync tasks',
  cronHeartbeat: 'Scheduler heartbeat: {t} ago',
  cronStale: 'Scheduler stale (idle for {t})',
  cronUnknown: 'Scheduler heartbeat: unknown',
  running: 'Running · {t}',
  idle: 'Idle',
  stuck: 'Likely stuck · lock held {t}',
  clearLocks: 'Clear stale locks',
  clearLocksDone: 'Cleared {n} locks. Sync resumes within a minute.',
  taskMsg: 'Message sync',
  taskFile: 'File sync',
  taskTask: 'Task sync',
  taskProject: 'Project sync',
  taskUser: 'User sync',
  taskRetry: 'Failure retry',

  failureQueue: 'Failure queue',
  retryAll: 'Retry all now',
  retryAllDone: 'Requeued. Retries start within a minute.',
  retry: 'Retry',
  del: 'Delete',
  emptyQueue: 'No failures',
  retriedTimes: 'retried {n}×',
  nextRetryIn: 'next in ~{n} min',
  nextRetryNow: 'retrying soon',
  actionSync: 'index',
  actionDelete: 'delete',

  searchTest: 'Search test bench',
  searchTestHint: 'Query the engine directly as admin to debug "why is it not found"',
  queryPlaceholder: 'Type a query…',
  search: 'Search',
  modeHybrid: 'Hybrid',
  modeFulltext: 'Full-text',
  modeVector: 'Semantic (vector)',
  srcFulltext: 'full-text',
  srcVector: 'semantic',
  srcBoth: 'full-text + semantic',
  noHits: 'No hits',
  tookMs: 'took {n}ms',

  dangerZone: 'Danger zone',
  rebuildTitle: 'Rebuild all indexes',
  rebuildDesc: 'Drops all 5 indexes and refills from source data. Search results will be incomplete for hours.',
  rebuildBtn: 'Rebuild…',
  rebuildAgainTitle: 'Confirm again',
  rebuildAgainDesc: 'This immediately truncates all 5 indexes and refills from source data. Search results will be incomplete meanwhile. Continue?',
  rebuildStarted: 'Rebuild triggered. The main app starts within 2 minutes.',
  refillConfirmTitle: 'Refill "{type}" index?',
  refillConfirmDesc: 'Truncates this index and refills from source (sync starts within 2 minutes). Search results for this type will be incomplete meanwhile.',
  refillStarted: 'Refill triggered',
  confirm: 'Confirm',
  cancel: 'Cancel',

  adminOnly: 'Search status panel · admins only',
}

const dicts: Record<Locale, typeof zh> = { zh, en }

export type MsgKey = keyof typeof zh

export function makeT(locale: Locale) {
  const dict = dicts[locale]
  return (key: MsgKey, vars?: Record<string, string | number>): string => {
    let s: string = dict[key]
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
    }
    return s
  }
}

export function fmtDuration(locale: Locale, sec: number): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (locale === 'zh') {
    if (d > 0) return `${d} 天${h > 0 ? ` ${h} 小时` : ''}`
    if (h > 0) return `${h} 小时${m > 0 ? ` ${m} 分` : ''}`
    if (m > 0) return `${m} 分钟`
    return `${Math.max(0, Math.floor(sec))} 秒`
  }
  if (d > 0) return `${d}d${h > 0 ? ` ${h}h` : ''}`
  if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ''}`
  if (m > 0) return `${m} min`
  return `${Math.max(0, Math.floor(sec))}s`
}

export function fmtBytes(bytes: number): string {
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(1)} GB`
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function fmtNum(n: number): string {
  return n.toLocaleString('en-US')
}
