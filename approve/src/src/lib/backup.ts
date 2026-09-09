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
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { once } from 'node:events'
import { resolve, sep } from 'node:path'
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate'
import { closeDb, dataDir, dbFilePath, getDb } from '#/lib/db'
import { uploadDir } from '#/lib/uploads'
import {
  BackupError,
  extractBackup,
  MAX_BACKUP_UPLOAD_BYTES,
  validateDatabase,
} from './backup-validation'

export interface BackupEntry {
  name: string
  size: number
  createdAt: string
}

// 仅允许本模块生成的命名，防目录穿越/任意文件读写。
const NAME_RE = /^approve-\d{8}-\d{6}(-\d+)?\.(zip|db)$/
const DB_ENTRY = 'approve.db'
const UPLOADS_PREFIX = 'uploads/'

let operationActive = false

async function exclusively<T>(operation: () => Promise<T>): Promise<T> {
  if (operationActive) throw new BackupError('backup.busy', 409)
  operationActive = true
  try {
    return await operation()
  } finally {
    operationActive = false
  }
}

function newName(extension: 'zip' | 'db'): string {
  const base = `approve-${tsSuffix()}`
  let name = `${base}.${extension}`
  let i = 1
  while (existsSync(resolve(backupDir(), name)))
    name = `${base}-${i++}.${extension}`
  return name
}

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
async function writeZip(
  target: string,
  entries: Array<ZipEntry>,
): Promise<void> {
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
  return exclusively(createBackupUnlocked)
}

async function createBackupUnlocked(): Promise<BackupEntry> {
  const dir = backupDir()
  mkdirSync(dir, { recursive: true })
  const name = newName('zip')
  const target = resolve(dir, name)
  const tmpZip = resolve(dir, `.tmp-${name}`)

  // 在线备份：即使有并发写也产出一致性快照（WAL 安全）。
  const tmpDb = resolve(dir, `.tmp-${name}.db`)
  try {
    await getDb().backup(tmpDb)
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
    await writeZip(tmpZip, [
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
    renameSync(tmpZip, target)
  } finally {
    if (existsSync(tmpDb)) rmSync(tmpDb, { force: true })
    if (existsSync(tmpZip)) rmSync(tmpZip, { force: true })
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
  if (operationActive) throw new BackupError('backup.busy', 409)
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

/** 本地导入只保存经过校验的备份，不触发恢复。客户端文件名只用于识别格式。 */
export async function importBackup(
  fileName: string,
  body: ReadableStream<Uint8Array> | null,
): Promise<BackupEntry> {
  return exclusively(async () => {
    const extension = fileName.toLowerCase().endsWith('.zip')
      ? 'zip'
      : fileName.toLowerCase().endsWith('.db')
        ? 'db'
        : null
    if (!extension || !body) throw new BackupError('backup.invalidFile')
    mkdirSync(backupDir(), { recursive: true })
    const staging = mkdtempSync(resolve(backupDir(), '.import-'))
    const source = resolve(staging, `source.${extension}`)
    const reader = body.getReader()
    let fd: number | undefined
    let size = 0
    try {
      fd = openSync(source, 'wx')
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.length
        if (size > MAX_BACKUP_UPLOAD_BYTES)
          throw new BackupError('backup.uploadTooLarge', 413)
        writeFileSync(fd, chunk.value)
      }
      closeSync(fd)
      fd = undefined
      if (!size) throw new BackupError('backup.invalidFile')
      if (extension === 'zip') await extractBackup(source, staging)
      else {
        // 校验可能补充旧库字段，原始导入文件仍原样保留。
        const candidate = resolve(staging, DB_ENTRY)
        copyFileSync(source, candidate)
        validateDatabase(candidate)
      }
      const name = newName(extension)
      renameSync(source, resolve(backupDir(), name))
      return entryOf(name)
    } finally {
      if (fd !== undefined) closeSync(fd)
      await reader.cancel().catch(() => {})
      reader.releaseLock()
      rmSync(staging, { recursive: true, force: true })
    }
  })
}

/** 候选文件全部校验后再生成安全备份；数据库和附件的切换期间不让出事件循环。 */
export async function restoreBackup(
  name: string,
): Promise<{ safetyBackup: string } | null> {
  return exclusively(async () => {
    const src = resolveBackupPath(name)
    if (!src) return null
    const staging = mkdtempSync(resolve(dataDir(), '.restore-'))
    const candidate = resolve(staging, DB_ENTRY)
    const legacy = name.endsWith('.db')
    const recovery = { keepStaging: false }
    try {
      if (legacy) {
        copyFileSync(src, candidate)
        validateDatabase(candidate)
      } else await extractBackup(src, staging)
      const safety = await createBackupUnlocked()
      const target = dbFilePath()
      const uDir = uploadDir()
      const oldDb = resolve(staging, 'original.db')
      const oldUploads = resolve(staging, 'original-uploads')
      let dbMoved = false
      let uploadsMoved = false
      let uploadsInstalled = false
      try {
        closeDb()
        renameSync(target, oldDb)
        dbMoved = true
        clearWalShm(target)
        renameSync(candidate, target)
        if (!legacy) {
          if (existsSync(uDir)) {
            renameSync(uDir, oldUploads)
            uploadsMoved = true
          }
          renameSync(resolve(staging, 'uploads'), uDir)
          uploadsInstalled = true
        }
        getDb()
      } catch (error) {
        try {
          closeDb()
          if (dbMoved) {
            clearWalShm(target)
            rmSync(target, { force: true })
            renameSync(oldDb, target)
          }
          if (uploadsInstalled) rmSync(uDir, { recursive: true, force: true })
          if (uploadsMoved) renameSync(oldUploads, uDir)
          getDb()
        } catch (rollbackError) {
          recovery.keepStaging = true
          console.error('[approve] restore rollback failed', {
            safetyBackup: safety.name,
            staging,
            error,
            rollbackError,
          })
          throw new BackupError('backup.rollbackFailed', 500)
        }
        console.error('[approve] restore failed; original data restored', error)
        throw new BackupError('backup.restoreFailed', 500)
      }
      return { safetyBackup: safety.name }
    } finally {
      if (!recovery.keepStaging)
        rmSync(staging, { recursive: true, force: true })
    }
  })
}
