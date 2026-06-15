/**
 * 数据备份（管理员）：打包本插件的 SQLite 数据库（approve.db）+ 本地上传附件目录。
 *
 * 附件经插件本地存储（见 lib/uploads.ts），故可与数据库一并备份/还原。
 * 备份为 zip：manifest.json + approve.db + uploads/<file>，落在
 * `${DATA_DIR}/backups/approve-YYYYMMDD-HHMMSS.zip`。兼容历史的 .db（纯库）备份。
 *
 * 数据库快照用 better-sqlite3 在线 backup()（WAL 安全）；还原 = 关连接→覆盖库 + 换 uploads→清 WAL/SHM→重开。
 */
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { once } from 'node:events'
import { resolve, sep } from 'node:path'
import { Zip, ZipDeflate, ZipPassThrough, unzipSync } from 'fflate'
import { closeDb, dataDir, dbFilePath, getDb } from '#/lib/db'
import { uploadDir } from '#/lib/uploads'

export interface BackupEntry {
  name: string
  size: number
  createdAt: string
}

// 仅允许本模块生成的命名，防目录穿越/任意文件读写。
const NAME_RE = /^approve-\d{8}-\d{6}(-\d+)?\.(zip|db)$/
const DB_ENTRY = 'approve.db'
const UPLOADS_PREFIX = 'uploads/'

function backupDir(): string {
  return resolve(dataDir(), 'backups')
}

function tsSuffix(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  )
}

function entryOf(name: string): BackupEntry {
  const st = statSync(resolve(backupDir(), name))
  return { name, size: st.size, createdAt: st.mtime.toISOString() }
}

/** 列出全部备份（按文件名倒序，新的在前）。 */
export function listBackups(): Array<BackupEntry> {
  const dir = backupDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => NAME_RE.test(n))
    .sort((a, b) => b.localeCompare(a))
    .map(entryOf)
}

interface ZipEntry {
  name: string
  path?: string
  data?: Uint8Array
  compress: boolean
}

/**
 * 流式把若干文件打成 zip 落盘：每写完一个文件就让出事件循环等缓冲落盘，
 * 把峰值内存控制在「单个文件 + 其压缩输出」量级，避免大量大图一次性进内存。
 */
async function writeZip(target: string, entries: Array<ZipEntry>): Promise<void> {
  const out = createWriteStream(target)
  let rejectErr: ((e: Error) => void) | null = null
  const onError = new Promise<never>((_, rej) => {
    rejectErr = rej
  })
  onError.catch(() => {})
  out.on('error', (e) => rejectErr?.(e))

  const zip = new Zip((err, chunk, final) => {
    if (err) {
      out.destroy(err)
      return
    }
    out.write(chunk)
    if (final) out.end()
  })
  const finished = new Promise<void>((res) => out.on('finish', () => res()))

  try {
    for (const e of entries) {
      const data = e.data ?? readFileSync(e.path as string)
      const file = e.compress
        ? new ZipDeflate(e.name, { level: 6 })
        : new ZipPassThrough(e.name)
      zip.add(file)
      file.push(data, true)
      if (out.writableNeedDrain) {
        await Promise.race([once(out, 'drain'), onError])
      }
    }
    zip.end()
    await Promise.race([finished, onError])
  } catch (e) {
    out.destroy()
    if (existsSync(target)) rmSync(target, { force: true })
    throw e
  }
}

/** 生成一次备份（数据库快照 + 上传附件）。 */
export async function createBackup(): Promise<BackupEntry> {
  const dir = backupDir()
  mkdirSync(dir, { recursive: true })
  let name = `approve-${tsSuffix()}.zip`
  if (existsSync(resolve(dir, name))) {
    const base = name.replace(/\.zip$/, '')
    let i = 1
    while (existsSync(resolve(dir, `${base}-${i}.zip`))) i++
    name = `${base}-${i}.zip`
  }
  const target = resolve(dir, name)

  // 在线备份：即使有并发写也产出一致性快照（WAL 安全）。
  const tmpDb = resolve(dir, `.tmp-${name}.db`)
  await getDb().backup(tmpDb)

  try {
    const uDir = uploadDir()
    const uploadFiles = existsSync(uDir)
      ? readdirSync(uDir, { withFileTypes: true })
          .filter((d) => d.isFile())
          .map((d) => d.name)
      : []
    const manifest = JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      uploads: uploadFiles.length,
    })
    await writeZip(target, [
      {
        name: 'manifest.json',
        data: new Uint8Array(Buffer.from(manifest, 'utf8')),
        compress: true,
      },
      { name: DB_ENTRY, path: tmpDb, compress: true },
      ...uploadFiles.map((f) => ({
        name: `${UPLOADS_PREFIX}${f}`,
        path: resolve(uDir, f),
        compress: false, // 多为已压缩的图片，再压意义不大
      })),
    ])
  } finally {
    if (existsSync(tmpDb)) rmSync(tmpDb, { force: true })
  }
  return entryOf(name)
}

/** 校验名称并解析到真实路径（不存在/非法返回 null）。 */
export function resolveBackupPath(name: string): string | null {
  if (!NAME_RE.test(name)) return null
  const dir = backupDir()
  const full = resolve(dir, name)
  if (!full.startsWith(dir + sep)) return null
  return existsSync(full) ? full : null
}

/** 删除指定备份。 */
export function deleteBackup(name: string): boolean {
  const full = resolveBackupPath(name)
  if (!full) return false
  rmSync(full, { force: true })
  return true
}

function clearWalShm(dbPath: string): void {
  for (const ext of ['-wal', '-shm']) {
    const f = `${dbPath}${ext}`
    if (existsSync(f)) rmSync(f, { force: true })
  }
}

/** 用指定备份覆盖当前数据库（与上传附件）。 */
export function restoreBackup(name: string): boolean {
  const src = resolveBackupPath(name)
  if (!src) return false
  return name.endsWith('.db') ? restoreLegacyDb(src) : restoreArchive(src)
}

/** 历史的纯 .db 备份：直接覆盖数据库文件。 */
function restoreLegacyDb(src: string): boolean {
  closeDb()
  const target = dbFilePath()
  copyFileSync(src, target)
  clearWalShm(target)
  getDb()
  return true
}

/** zip 备份：还原数据库 + 原子替换 uploads 目录（旧目录留 .bak）。 */
function restoreArchive(src: string): boolean {
  const files = unzipSync(readFileSync(src))
  if (!(DB_ENTRY in files)) return false
  const dbBuf = files[DB_ENTRY]

  const uDir = uploadDir()
  const parent = resolve(uDir, '..')
  const staging = resolve(parent, `.uploads-restore-${tsSuffix()}`)
  if (existsSync(staging)) rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  try {
    for (const [path, buf] of Object.entries(files)) {
      if (!path.startsWith(UPLOADS_PREFIX)) continue
      const fname = path.slice(UPLOADS_PREFIX.length)
      if (!fname || fname.includes('/')) continue // 防穿越
      writeFileSync(resolve(staging, fname), buf)
    }
  } catch (e) {
    rmSync(staging, { recursive: true, force: true })
    throw e
  }

  // 先恢复数据库（最关键），再原子替换 uploads 目录。
  closeDb()
  const target = dbFilePath()
  writeFileSync(target, dbBuf)
  clearWalShm(target)
  if (existsSync(uDir)) {
    renameSync(uDir, resolve(parent, `uploads.bak-${tsSuffix()}`))
  }
  renameSync(staging, uDir)
  getDb()
  return true
}
