import {
  closeSync,
  createReadStream,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { Unzip, UnzipInflate, unzipSync } from 'fflate'
import { migrate } from '#/lib/db'
import type { MsgKey } from '#/lib/i18n/messages'

export const MAX_BACKUP_UPLOAD_BYTES = 100 * 1024 * 1024
const MAX_EXPANDED_BYTES = 512 * 1024 * 1024
const MAX_ENTRIES = 10000
const TABLES = [
  'proc_def',
  'proc_inst',
  'proc_task',
  'proc_actor',
  'proc_event',
  'proc_attachment',
  'proc_msg',
  'sys_settings',
]

export class BackupError extends Error {
  constructor(
    public key: MsgKey,
    public status = 400,
  ) {
    super(key)
  }
}

function invalid(): never {
  throw new BackupError('backup.invalidFile')
}

/** 仅在临时目录检查和升级候选库，不接触当前数据库。 */
export function validateDatabase(path: string): void {
  const fd = openSync(path, 'r')
  const header = Buffer.alloc(16)
  try {
    if (
      readSync(fd, header, 0, 16, 0) !== 16 ||
      header.toString() !== 'SQLite format 3\0'
    )
      invalid()
  } finally {
    closeSync(fd)
  }
  let candidate: Database.Database | undefined
  const schema = new Database(':memory:')
  try {
    candidate = new Database(path, { fileMustExist: true })
    const integrity = candidate.pragma('integrity_check') as Array<{
      integrity_check: string
    }>
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok')
      invalid()
    const tables = new Set(
      (
        candidate
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as Array<{ name: string }>
      ).map((row) => row.name),
    )
    if (TABLES.some((table) => !tables.has(table))) invalid()
    migrate(candidate)
    migrate(schema)
    for (const table of TABLES) {
      const columns = new Set(
        (
          candidate.pragma(`table_info(${table})`) as Array<{ name: string }>
        ).map((row) => row.name),
      )
      const expected = schema.pragma(`table_info(${table})`) as Array<{
        name: string
      }>
      if (expected.some((column) => !columns.has(column.name))) invalid()
    }
  } catch (error) {
    if (error instanceof BackupError) throw error
    invalid()
  } finally {
    candidate?.close()
    schema.close()
  }
}

function allowedEntry(name: string): boolean {
  if (name === 'manifest.json' || name === 'approve.db') return true
  if (!name.startsWith('uploads/')) return false
  const file = name.slice('uploads/'.length)
  return !!file && file !== '.' && file !== '..' && !/[\\/\0:]/.test(file)
}

/** 用 ZIP 目录预检体积，再分块解压落盘；同时核对实际输出，不能仅信任 ZIP 声明的大小。 */
export async function extractBackup(
  src: string,
  staging: string,
): Promise<void> {
  const entries = new Map<string, number>()
  let declaredBytes = 0
  try {
    unzipSync(readFileSync(src), {
      filter: (entry) => {
        if (
          !allowedEntry(entry.name) ||
          entries.has(entry.name) ||
          ![0, 8].includes(entry.compression)
        )
          invalid()
        declaredBytes += entry.originalSize
        entries.set(entry.name, entry.originalSize)
        if (declaredBytes > MAX_EXPANDED_BYTES || entries.size > MAX_ENTRIES)
          throw new BackupError('backup.expandedTooLarge')
        if (entry.name === 'manifest.json' && entry.originalSize > 4096)
          invalid()
        return false
      },
    })
    if (!entries.has('approve.db') || !entries.has('manifest.json')) invalid()
  } catch (error) {
    if (error instanceof BackupError) throw error
    invalid()
  }

  mkdirSync(resolve(staging, 'uploads'), { recursive: true })
  const openFiles = new Set<number>()
  const seen = new Set<string>()
  const complete = new Set<string>()
  let expandedBytes = 0
  try {
    const unzip = new Unzip((file) => {
      if (
        !entries.has(file.name) ||
        seen.has(file.name) ||
        !allowedEntry(file.name)
      )
        invalid()
      seen.add(file.name)
      const fd = openSync(resolve(staging, file.name), 'wx')
      openFiles.add(fd)
      let size = 0
      file.ondata = (error, chunk, final) => {
        if (error) invalid()
        size += chunk.length
        expandedBytes += chunk.length
        if (expandedBytes > MAX_EXPANDED_BYTES)
          throw new BackupError('backup.expandedTooLarge')
        if (size > entries.get(file.name)!) invalid()
        writeFileSync(fd, chunk)
        if (final) {
          if (size !== entries.get(file.name)) invalid()
          closeSync(fd)
          openFiles.delete(fd)
          complete.add(file.name)
        }
      }
      file.start()
    })
    unzip.register(UnzipInflate)
    for await (const chunk of createReadStream(src, {
      highWaterMark: 64 * 1024,
    })) {
      unzip.push(new Uint8Array(chunk), false)
    }
    unzip.push(new Uint8Array(), true)
    if (complete.size !== entries.size) invalid()
    const manifest = JSON.parse(
      readFileSync(resolve(staging, 'manifest.json'), 'utf8'),
    )
    if (
      !manifest ||
      manifest.version !== 1 ||
      !Number.isInteger(manifest.uploads) ||
      manifest.uploads !== entries.size - 2
    )
      invalid()
    validateDatabase(resolve(staging, 'approve.db'))
  } catch (error) {
    if (error instanceof BackupError) throw error
    invalid()
  } finally {
    for (const fd of openFiles) closeSync(fd)
  }
}
