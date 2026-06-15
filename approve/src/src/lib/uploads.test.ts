import { describe, expect, it } from 'vitest'
import { sanitizeAttachments, sniffImageType } from '#/lib/uploads'

describe('sniffImageType', () => {
  it('识别 PNG/JPEG 头，未知返回 null', () => {
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(
      'image/png',
    )
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff]))).toBe('image/jpeg')
    expect(sniffImageType(Buffer.from([1, 2, 3, 4]))).toBeNull()
  })
})

describe('sanitizeAttachments', () => {
  const ok = '/apps/approve/api/uploads/00000000-0000-4000-8000-000000000000'

  it('保留指向本插件 uploads 的合法项', () => {
    const out = sanitizeAttachments([
      { name: 'a.png', url: ok, size: 10, mime: 'image/png' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe(ok)
    expect(out[0].name).toBe('a.png')
  })

  it('丢弃外部 URL / 非法存储名 / 非数组', () => {
    expect(sanitizeAttachments('x')).toEqual([])
    expect(
      sanitizeAttachments([{ name: 'x', url: 'https://evil.com/a.png' }]),
    ).toEqual([])
    expect(
      sanitizeAttachments([
        { name: 'x', url: '/apps/approve/api/uploads/../../etc/passwd' },
      ]),
    ).toEqual([])
  })

  it('缺失字段时回填默认值', () => {
    const out = sanitizeAttachments([{ url: ok }])
    expect(out[0]).toEqual({
      name: '附件',
      url: ok,
      size: 0,
      mime: 'application/octet-stream',
    })
  })
})
