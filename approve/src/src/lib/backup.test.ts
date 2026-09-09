import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import type * as Fs from 'node:fs'
import { Zip, ZipPassThrough, zipSync } from 'fflate'
import { closeDb, dbFilePath, getDb } from './db'
import {
  createBackup,
  deleteBackup,
  importBackup,
  listBackups,
  resolveBackupPath,
  restoreBackup,
} from './backup'
import { importBackupHandler } from './handlers/backups'
import { MAX_BACKUP_UPLOAD_BYTES } from './backup-validation'
import { uploadDir } from './uploads'

const fixture = await vi.hoisted(async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const oldDir = process.env.APPROVE_DATA_DIR
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'approve-backup-test-'))
  process.env.APPROVE_DATA_DIR = dir
  return { dir, oldDir }
})

vi.mock('#/lib/migrate/migrate', () => ({ ensureMigrated: async () => {} }))
vi.mock('#/lib/seed/builtin', () => ({ ensureBuiltinSeeded: () => {} }))
vi.mock('#/lib/dootask-server', () => ({
  verifyUserToken: async (token: string | null) =>
    token ? { userid: Number(token), nickname: 'Test' } : null,
}))
vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof Fs>()
  return { ...original, renameSync: vi.fn(original.renameSync) }
})

beforeEach(() => {
  closeDb()
  rmSync(fixture.dir, { recursive: true, force: true })
  mkdirSync(fixture.dir, { recursive: true })
  vi.clearAllMocks()
  getDb()
    .prepare(
      "INSERT INTO sys_settings (key,value) VALUES ('backup_test', 'original')",
    )
    .run()
  mkdirSync(uploadDir(), { recursive: true })
  writeFileSync(resolve(uploadDir(), 'file.txt'), 'original file')
})
afterAll(() => {
  closeDb()
  rmSync(fixture.dir, { recursive: true, force: true })
  if (fixture.oldDir === undefined) delete process.env.APPROVE_DATA_DIR
  else process.env.APPROVE_DATA_DIR = fixture.oldDir
})

function value() {
  return (
    getDb()
      .prepare("SELECT value FROM sys_settings WHERE key = 'backup_test'")
      .get() as { value: string }
  ).value
}

function change() {
  getDb()
    .prepare(
      "UPDATE sys_settings SET value = 'changed' WHERE key = 'backup_test'",
    )
    .run()
  writeFileSync(resolve(uploadDir(), 'file.txt'), 'changed file')
  writeFileSync(resolve(uploadDir(), 'new.txt'), 'new file')
}

function stream(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

function archive(entries: Array<[string, Uint8Array]>) {
  const chunks: Array<Uint8Array> = []
  const zip = new Zip((error, bytes) => {
    if (error) throw error
    chunks.push(bytes)
  })
  for (const [name, bytes] of entries) {
    const file = new ZipPassThrough(name)
    zip.add(file)
    file.push(bytes, true)
  }
  zip.end()
  return Buffer.concat(chunks)
}

const manifest = (uploads: number, version = 1) =>
  Buffer.from(JSON.stringify({ version, uploads }))

async function dbBytes() {
  const path = resolve(fixture.dir, 'fixture.db')
  await getDb().backup(path)
  return readFileSync(path)
}

describe('备份导入和还原', () => {
  it('下载后删除服务端备份，再导入、恢复数据库和附件，并保留可恢复的安全备份', async () => {
    const created = await createBackup()
    const bytes = readFileSync(resolveBackupPath(created.name)!)
    expect(deleteBackup(created.name)).toBe(true)
    change()
    const imported = await importBackup('renamed backup (1).zip', stream(bytes))
    expect(imported.name).toMatch(/^approve-.*\.zip$/)
    expect(value()).toBe('changed')
    expect(readFileSync(resolveBackupPath(imported.name)!)).toEqual(bytes)
    const restored = await restoreBackup(imported.name)
    expect(value()).toBe('original')
    expect(readFileSync(resolve(uploadDir(), 'file.txt'), 'utf8')).toBe(
      'original file',
    )
    expect(existsSync(resolve(uploadDir(), 'new.txt'))).toBe(false)
    expect(restored?.safetyBackup).not.toBe(imported.name)
    expect(listBackups()).toHaveLength(2)
    await restoreBackup(restored!.safetyBackup)
    expect(value()).toBe('changed')
    expect(readFileSync(resolve(uploadDir(), 'file.txt'), 'utf8')).toBe(
      'changed file',
    )
    expect(existsSync(resolve(uploadDir(), 'new.txt'))).toBe(true)
  })

  it('兼容历史 DB 导入，只恢复数据库、不替换附件', async () => {
    const bytes = await dbBytes()
    change()
    const imported = await importBackup('old.db', stream(bytes))
    await restoreBackup(imported.name)
    expect(value()).toBe('original')
    expect(readFileSync(resolve(uploadDir(), 'file.txt'), 'utf8')).toBe(
      'changed file',
    )
  })

  it('相同文件多次导入不覆盖已存在的备份', async () => {
    const bytes = await dbBytes()
    const a = await importBackup('old.db', stream(bytes))
    const b = await importBackup('old.db', stream(bytes))
    expect(a.name).not.toBe(b.name)
    expect(listBackups()).toHaveLength(2)
  })

  it.each(['../escape', '..', 'a/b', 'a\\b', '/absolute', 'C:file'])(
    '拒绝危险附件路径 %s',
    async (name) => {
      const bytes = archive([
        ['manifest.json', manifest(1)],
        ['approve.db', await dbBytes()],
        [`uploads/${name}`, Buffer.from('x')],
      ])
      await expect(
        importBackup('bad.zip', stream(bytes)),
      ).rejects.toMatchObject({ key: 'backup.invalidFile' })
      expect(value()).toBe('original')
      expect(listBackups()).toHaveLength(0)
      expect(readdirSync(resolve(fixture.dir, 'backups'))).toEqual([])
    },
  )

  it.each([
    'duplicate',
    'unknown',
    'missing-db',
    'bad-manifest',
    'future-version',
    'wrong-count',
    'corrupt-db',
    'truncated',
  ])('拒绝不完整或不兼容的归档 %s', async (type) => {
    const entries: Array<[string, Uint8Array]> = [
      ['manifest.json', manifest(0)],
      ['approve.db', await dbBytes()],
    ]
    if (type === 'duplicate') entries.push(['approve.db', await dbBytes()])
    if (type === 'unknown') entries.push(['unexpected.txt', Buffer.from('x')])
    if (type === 'missing-db') entries.pop()
    if (type === 'bad-manifest') entries[0][1] = Buffer.from('not json')
    if (type === 'future-version') entries[0][1] = manifest(0, 999)
    if (type === 'wrong-count') entries[0][1] = manifest(3)
    if (type === 'corrupt-db')
      entries[1][1] = Buffer.from('SQLite format 3\0invalid data')
    let bytes = archive(entries)
    if (type === 'truncated') bytes = bytes.subarray(0, bytes.length - 22)
    await expect(importBackup('bad.zip', stream(bytes))).rejects.toMatchObject({
      key: 'backup.invalidFile',
    })
    expect(listBackups()).toHaveLength(0)
    expect(value()).toBe('original')
  })

  it('拒绝非审批数据库和空文件', async () => {
    const bytes = await dbBytes()
    await expect(
      importBackup('bad.zip', stream(new Uint8Array())),
    ).rejects.toMatchObject({ key: 'backup.invalidFile' })
    await expect(importBackup('bad.txt', stream(bytes))).rejects.toMatchObject({
      key: 'backup.invalidFile',
    })
    getDb().exec('DROP TABLE proc_msg')
    const path = resolve(fixture.dir, 'other.db')
    await getDb().backup(path)
    await expect(
      importBackup('other.db', stream(readFileSync(path))),
    ).rejects.toMatchObject({ key: 'backup.invalidFile' })
  })

  it('对流式上传实际计数，超限及时拒绝并清除临时文件', async () => {
    let sent = 0
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1024 * 1024
        controller.enqueue(new Uint8Array(1024 * 1024))
      },
      cancel() {
        cancelled = true
      },
    })
    await expect(importBackup('large.zip', body)).rejects.toMatchObject({
      status: 413,
    })
    expect(sent).toBeLessThanOrEqual(MAX_BACKUP_UPLOAD_BYTES + 3 * 1024 * 1024)
    expect(cancelled).toBe(true)
    expect(readdirSync(resolve(fixture.dir, 'backups'))).toEqual([])
  })

  it('解压前拒绝超量文件和伪造的超大解压体积', async () => {
    const entries: Record<string, Uint8Array> = {}
    for (let i = 0; i < 10001; i++) entries[`uploads/${i}`] = new Uint8Array()
    await expect(
      importBackup('many.zip', stream(zipSync(entries))),
    ).rejects.toMatchObject({ key: 'backup.expandedTooLarge' })
    const bytes = archive([
      ['manifest.json', manifest(0)],
      ['approve.db', await dbBytes()],
    ])
    // ZIP 中央目录的未压缩大小字段，模拟高压缩比/伪造体积的归档。
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    bytes.writeUInt32LE(513 * 1024 * 1024, central + 24)
    await expect(importBackup('bomb.zip', stream(bytes))).rejects.toMatchObject(
      { key: 'backup.expandedTooLarge' },
    )
  })

  it('还原途中目录替换失败时回滚数据库和附件', async () => {
    const backup = await createBackup()
    change()
    const fs = await vi.importActual<typeof Fs>('node:fs')
    vi.mocked(renameSync).mockImplementation((from, to) => {
      if (
        String(from).includes('.restore-') &&
        String(from).endsWith('/uploads') &&
        String(to) === uploadDir()
      )
        throw new Error('simulated disk failure')
      fs.renameSync(from, to)
    })
    try {
      await expect(restoreBackup(backup.name)).rejects.toMatchObject({
        key: 'backup.restoreFailed',
      })
      expect(value()).toBe('changed')
      expect(readFileSync(resolve(uploadDir(), 'file.txt'), 'utf8')).toBe(
        'changed file',
      )
      expect(existsSync(resolve(uploadDir(), 'new.txt'))).toBe(true)
      expect(listBackups()).toHaveLength(2)
      expect(
        readdirSync(fixture.dir).some((name) => name.startsWith('.restore-')),
      ).toBe(false)
    } finally {
      vi.mocked(renameSync).mockImplementation(fs.renameSync)
    }
  })

  it('安全备份创建失败，不改变当前数据', async () => {
    const backup = await createBackup()
    change()
    const spy = vi
      .spyOn(getDb(), 'backup')
      .mockRejectedValueOnce(new Error('backup failed'))
    try {
      await expect(restoreBackup(backup.name)).rejects.toThrow('backup failed')
      expect(value()).toBe('changed')
      expect(readFileSync(resolve(uploadDir(), 'file.txt'), 'utf8')).toBe(
        'changed file',
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('串行执行备份写操作，避免上传/还原/删除之间互相干扰', async () => {
    const bytes = await dbBytes()
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c
      },
    })
    const pending = importBackup('old.db', body)
    await expect(createBackup()).rejects.toMatchObject({ status: 409 })
    await expect(
      restoreBackup('approve-20000101-000000.zip'),
    ).rejects.toMatchObject({ status: 409 })
    expect(() => deleteBackup('approve-20000101-000000.zip')).toThrow(
      'backup.busy',
    )
    controller.enqueue(bytes)
    controller.close()
    await pending
    expect((await createBackup()).name).toBeTruthy()
  })

  it('导入接口管理员鉴权，提前拒绝声明过大的请求', async () => {
    vi.stubEnv('APPROVE_ADMIN_USER_IDS', '1')
    try {
      for (const user of [undefined, '2', '1']) {
        const response = await importBackupHandler(
          new Request('http://x/apps/approve/api/admin/backups?name=file.zip', {
            method: 'PUT',
            headers: {
              ...(user ? { 'x-user-token': user } : {}),
              'content-length': String(MAX_BACKUP_UPLOAD_BYTES + 1),
            },
          }),
        )
        expect(response.status).toBe(user === '1' ? 413 : user ? 403 : 401)
      }
    } finally {
      vi.unstubAllEnvs()
      process.env.APPROVE_DATA_DIR = fixture.dir
    }
  })

  it('还原前再次校验服务器备份，损坏文件不覆盖数据', async () => {
    const backup = await createBackup()
    writeFileSync(resolveBackupPath(backup.name)!, 'invalid archive')
    await expect(restoreBackup(backup.name)).rejects.toMatchObject({
      key: 'backup.invalidFile',
    })
    expect(value()).toBe('original')
    expect(existsSync(dbFilePath())).toBe(true)
  })
})
