import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadHandler, uploadLimitsHandler } from './uploads'
import { saveUpload } from '#/lib/uploads'

vi.mock('#/lib/auth', async (original) => ({
  ...(await original()),
  requireUser: async (req: Request) =>
    req.headers.has('x-user-token')
      ? { userId: 41, isAdmin: false }
      : new Response(null, { status: 401 }),
}))
vi.mock('#/lib/uploads', async (original) => ({
  ...(await original()),
  saveUpload: vi.fn(async (file: File) => ({
    name: file.name,
    size: file.size,
  })),
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

function request(size: number): Request {
  const body = new FormData()
  body.set('file', new File([new Uint8Array(size)], 'contract.pdf'))
  return new Request('http://localhost/api/uploads', {
    method: 'POST',
    body,
    headers: { 'x-user-token': 'test', 'x-lang': 'zh' },
  })
}

describe('upload limits', () => {
  it('未登录不能读取配置或上传', async () => {
    const req = new Request('http://localhost/api/uploads')
    expect((await uploadLimitsHandler(req)).status).toBe(401)
    expect((await uploadHandler(req)).status).toBe(401)
  })
  it('普通用户读取有效配置', async () => {
    vi.stubEnv('APPROVE_MAX_UPLOAD_MB', '200')
    const response = await uploadLimitsHandler(request(1))
    expect(await response.json()).toEqual({
      data: { maxUploadBytes: 200 * 1024 * 1024 },
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('等于上限可上传，超过一个字节不可上传', async () => {
    vi.stubEnv('APPROVE_MAX_UPLOAD_MB', '1')
    expect((await uploadHandler(request(1024 * 1024))).status).toBe(201)
    const response = await uploadHandler(request(1024 * 1024 + 1))
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      error: '文件 contract.pdf 超过 1MB 上限',
    })
    expect(saveUpload).toHaveBeenCalledTimes(1)
  })
  it('过大的请求在解析 multipart 前拒绝', async () => {
    vi.stubEnv('APPROVE_MAX_UPLOAD_MB', '1')
    const req = request(1)
    req.headers.set('content-length', String(2 * 1024 * 1024))
    const parse = vi.spyOn(req, 'formData')
    expect((await uploadHandler(req)).status).toBe(413)
    expect(parse).not.toHaveBeenCalled()
    expect(saveUpload).not.toHaveBeenCalled()
  })
})
