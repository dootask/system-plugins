import { afterEach, describe, expect, it, vi } from 'vitest'
import { setAuth, setLocale, uploadFile } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('uploadFile preflight', () => {
  it('超限只查询上限，不发送文件，并提示文件名和当前上限', async () => {
    setAuth({ userId: 41, token: 'test' })
    setLocale('zh')
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ data: { maxUploadBytes: 1024 * 1024 } }),
      )
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      uploadFile(new File([new Uint8Array(1024 * 1024 + 1)], 'large.pdf')),
    ).rejects.toThrow('文件 large.pdf 超过 1MB 上限')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('等于上限正常上传', async () => {
    setAuth({ userId: 41, token: 'test' })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ data: { maxUploadBytes: 1024 * 1024 } }),
      )
      .mockResolvedValueOnce(Response.json({ data: { name: 'exact.pdf' } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(
      await uploadFile(new File([new Uint8Array(1024 * 1024)], 'exact.pdf')),
    ).toEqual({ name: 'exact.pdf' })
    expect(fetchMock.mock.calls[1][1].method).toBe('POST')
  })
  it('读取配置失败时不继续上传', async () => {
    setAuth({ userId: 41, token: 'test' })
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: 'unavailable' }, { status: 503 }),
      )
    vi.stubGlobal('fetch', fetchMock)
    await expect(uploadFile(new File(['a'], 'a.txt'))).rejects.toThrow(
      'unavailable',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
