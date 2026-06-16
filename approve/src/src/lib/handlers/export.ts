import ExcelJS from 'exceljs'
import { forbidden, ok, requireUser } from '#/lib/auth'
import { countForExport, listForExport } from '#/lib/repo/insts'
import type { ExportFilter } from '#/lib/repo/insts'
import { getDef } from '#/lib/repo/defs'
import { lastDecisionByInst } from '#/lib/repo/events'
import { fetchDepartmentNames, resolveUsers } from '#/lib/dootask-server'
import type { FieldDef, FormSchema } from '#/lib/form/types'
import type { ProcDefRow, UserLite } from '#/lib/types'

// 管理员导出审批数据为 XLSX。通用列恒定；当筛选指定单个模板时，额外把该模板的
// 表单字段展开为列（同模板 schema 一致才可对齐）。下载机制见前端 downloadAuthed。

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  running: '审批中',
  approved: '已通过',
  rejected: '已拒绝',
  withdrawn: '已撤回',
  archived: '已归档',
}
const DECISION_LABEL: Record<string, string> = {
  approve: '通过',
  reject: '拒绝',
  return: '退回',
  withdraw: '撤回',
  archive: '归档',
}
const VALID_STATUSES = [
  'running',
  'approved',
  'rejected',
  'withdrawn',
  'archived',
  'draft',
]
/** 单次导出行上限（与 repo listForExport 默认一致）。 */
const EXPORT_LIMIT = 10000

function parseFilter(url: URL): ExportFilter {
  const q = (k: string) => url.searchParams.get(k) ?? undefined
  const statusesRaw = q('statuses')
  const statuses = statusesRaw
    ? statusesRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => VALID_STATUSES.includes(s))
    : undefined
  const defIdRaw = q('defId')
  const defId = defIdRaw ? Number(defIdRaw) : undefined
  return {
    from: q('from'),
    to: q('to'),
    statuses: statuses && statuses.length > 0 ? statuses : undefined,
    defId: defId && Number.isFinite(defId) && defId > 0 ? defId : undefined,
    keyword: q('keyword')?.trim() || undefined,
    limit: EXPORT_LIMIT,
  }
}

/** 发起→结束 的耗时（天/小时/分），未结束返回空。 */
function fmtDuration(from: string, to: string | null): string {
  if (!to) return ''
  const a = Date.parse(from.replace(' ', 'T'))
  const b = Date.parse(to.replace(' ', 'T'))
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return ''
  let mins = Math.round((b - a) / 60000)
  const d = Math.floor(mins / 1440)
  mins -= d * 1440
  const h = Math.floor(mins / 60)
  const m = mins - h * 60
  const parts: Array<string> = []
  if (d) parts.push(`${d}天`)
  if (h) parts.push(`${h}小时`)
  if (m || parts.length === 0) parts.push(`${m}分`)
  return parts.join('')
}

interface FmtCtx {
  nick: (id: number) => string
  deptNames: Map<number, string>
}

/** 把单个表单字段值格式化为单元格文本（按字段类型）。 */
function formatField(f: FieldDef, value: unknown, ctx: FmtCtx): string {
  if (value === undefined || value === null || value === '') return ''
  switch (f.type) {
    case 'select': {
      const opt = f.options?.find((o) => o.value === value)
      return opt ? opt.label : String(value)
    }
    case 'multiselect': {
      const arr = Array.isArray(value) ? value : [value]
      return arr
        .map((v) => f.options?.find((o) => o.value === v)?.label ?? String(v))
        .join('、')
    }
    case 'daterange':
      return Array.isArray(value)
        ? value.filter(Boolean).join(' ~ ')
        : String(value)
    case 'user': {
      const arr = Array.isArray(value) ? value : [value]
      return arr.map((v) => ctx.nick(Number(v))).join('、')
    }
    case 'dept': {
      const arr = Array.isArray(value) ? value : [value]
      return arr.map((v) => ctx.deptNames.get(Number(v)) ?? `部门#${v}`).join('、')
    }
    case 'file': {
      const arr = Array.isArray(value)
        ? (value as Array<{ name?: string } | null>)
        : []
      return arr
        .map((x) => x?.name)
        .filter(Boolean)
        .join('、')
    }
    case 'table': {
      const arr = Array.isArray(value) ? value : []
      return arr.length ? `${arr.length} 行` : ''
    }
    default:
      return String(value)
  }
}

/**
 * GET /api/admin/export?from=&to=&statuses=a,b&defId=&keyword=[&count=1]
 * - count=1：仅返回 { total }（前端预检数量/截断提示），不生成文件。
 * - 否则：返回 XLSX 二进制（仅管理员）。
 */
export async function exportInstsHandler(request: Request): Promise<Response> {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  if (!auth.isAdmin) return forbidden('仅管理员可导出审批数据')

  const url = new URL(request.url)
  const filter = parseFilter(url)
  const total = countForExport(filter)

  if (url.searchParams.get('count') === '1') {
    return ok({ total, limit: EXPORT_LIMIT })
  }

  const token = request.headers.get('x-user-token')
  const rows = listForExport(filter)

  // 选定模板 → 展开其表单字段为列（desc 无值跳过）。
  let expandFields: Array<FieldDef> = []
  let selectedDef: ProcDefRow | undefined
  if (filter.defId) {
    selectedDef = getDef(filter.defId)
    if (selectedDef) {
      try {
        const schema = JSON.parse(selectedDef.form_schema || '[]') as FormSchema
        expandFields = schema.filter((f) => f.type !== 'desc')
      } catch {
        expandFields = []
      }
    }
  }

  // 解析昵称（发起人 + 末次处理人 + user 字段）与部门名（best-effort）。
  const decisions = lastDecisionByInst()
  const userIds = new Set<number>()
  const formDataCache = new Map<number, Record<string, unknown>>()
  for (const r of rows) {
    userIds.add(r.initiator_id)
    const d = decisions.get(r.id)
    if (d) userIds.add(d.actor_id)
    if (expandFields.length) {
      let fd: Record<string, unknown> = {}
      try {
        fd = JSON.parse(r.form_data || '{}') as Record<string, unknown>
      } catch {
        fd = {}
      }
      formDataCache.set(r.id, fd)
      for (const f of expandFields) {
        if (f.type === 'user') {
          const v = fd[f.key]
          const arr = Array.isArray(v) ? v : v != null ? [v] : []
          for (const x of arr) {
            const n = Number(x)
            if (Number.isFinite(n) && n > 0) userIds.add(n)
          }
        }
      }
    }
  }
  const users = await resolveUsers([...userIds], token)
  const deptNames = await fetchDepartmentNames(token)
  const nick = (id: number) => {
    const u = users[id] as UserLite | undefined
    return u ? u.nickname : `用户#${id}`
  }
  const ctx: FmtCtx = { nick, deptNames }

  // 组装工作簿。
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('审批数据')
  const baseHeaders = [
    '单号',
    '标题',
    '模板',
    '分类',
    '发起人',
    '发起部门',
    '状态',
    '发起时间',
    '结束时间',
    '耗时',
    '末次处理',
    '末次意见',
  ]
  const headers = [...baseHeaders, ...expandFields.map((f) => f.label)]
  ws.addRow(headers)
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  }

  const defCache = new Map<number, ProcDefRow | undefined>()
  const getDefCached = (id: number) => {
    if (!defCache.has(id)) defCache.set(id, getDef(id))
    return defCache.get(id)
  }

  for (const r of rows) {
    const d = filter.defId ? selectedDef : getDefCached(r.def_id)
    const dec = decisions.get(r.id)
    const fd =
      formDataCache.get(r.id) ??
      (() => {
        try {
          return JSON.parse(r.form_data || '{}') as Record<string, unknown>
        } catch {
          return {}
        }
      })()
    ws.addRow([
      r.id,
      r.title,
      d?.name ?? '',
      d?.category ?? '',
      nick(r.initiator_id),
      r.dept_id ? (deptNames.get(r.dept_id) ?? '') : '',
      STATUS_LABEL[r.status] ?? r.status,
      r.created_at,
      r.finished_at ?? '',
      fmtDuration(r.created_at, r.finished_at),
      dec ? `${nick(dec.actor_id)}（${DECISION_LABEL[dec.action] ?? dec.action}）` : '',
      dec?.remark ?? '',
      ...expandFields.map((f) => formatField(f, fd[f.key], ctx)),
    ])
  }

  // 列宽：标题/意见较宽，时间适中，其余统一。
  const wide = new Set(['标题', '末次意见'])
  const medium = new Set(['发起时间', '结束时间', '末次处理', '模板'])
  ws.columns.forEach((col, i) => {
    const h = headers[i]
    col.width = wide.has(h) ? 32 : medium.has(h) ? 20 : 14
  })

  const buf = await wb.xlsx.writeBuffer()
  // 走主程序 downloadUrl/原生下载时文件名由 Content-Disposition 决定（前端控制不了），
  // 故前端把期望文件名经 fname 传来，这里消毒后写入；中文用 RFC5987 filename* 编码。
  const safeName = sanitizeFilename(url.searchParams.get('fname'))
  const asciiName = safeName.replace(/[^\x20-\x7e]/g, '_') || 'approve-export.xlsx'
  return new Response(buf, {
    headers: {
      'content-type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(
        safeName || 'approve-export.xlsx',
      )}`,
      // 供前端读取实际导出/匹配数量（截断提示）。
      'x-export-rows': String(rows.length),
      'x-export-total': String(total),
    },
  })
}

/** 文件名消毒：去掉路径分隔符/控制字符/引号，限长，防注入 Content-Disposition。 */
function sanitizeFilename(name: string | null): string {
  if (!name) return ''
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim().slice(0, 120)
}
