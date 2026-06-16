import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRequestToken, requireUser } from './auth'

// requireUser → verifyUserToken（打主程序）。测试里 mock 成 token=值即过鉴权。
vi.mock('#/lib/dootask-server', () => ({
  verifyUserToken: async (token: string | null) => {
    if (!token) return null
    const m = /^u:(\d+)$/.exec(token)
    const userid = m ? Number(m[1]) : 10
    return { userid, nickname: `用户${userid}`, email: undefined }
  },
}))

afterEach(() => vi.clearAllMocks())

const URL = 'http://x/apps/approve/api/me'

describe('getRequestToken', () => {
  it('优先取 x-user-token 头', () => {
    const r = new Request(URL, { headers: { 'x-user-token': 'a', Token: 'b' } })
    expect(getRequestToken(r)).toBe('a')
  })

  it('回退到 doo app call 注入的 Token 头', () => {
    const r = new Request(URL, { headers: { Token: 'b' } })
    expect(getRequestToken(r)).toBe('b')
  })

  it('再回退到 URL 查询串', () => {
    const r = new Request(`${URL}?user_token=c`)
    expect(getRequestToken(r)).toBe('c')
  })

  it('都没有时为 null', () => {
    expect(getRequestToken(new Request(URL))).toBeNull()
  })
})

describe('requireUser 兼容 Token 头（doo app call / AI 调用）', () => {
  it('用 Token 头可通过鉴权', async () => {
    const r = new Request(URL, { headers: { Token: 'u:7' } })
    const auth = await requireUser(r)
    expect(auth).not.toBeInstanceOf(Response)
    if (!(auth instanceof Response)) expect(auth.userId).toBe(7)
  })

  it('无凭据返回 401', async () => {
    const auth = await requireUser(new Request(URL))
    expect(auth).toBeInstanceOf(Response)
    if (auth instanceof Response) expect(auth.status).toBe(401)
  })
})
