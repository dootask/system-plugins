import { useCallback, useEffect, useState } from "react"

import { Loader2 } from "lucide-react"

import { messageError } from "@dootask/tools"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useI18n } from "@/lib/i18n-context"

interface QuotaBucket {
  kind: string
  balance: number
  amount: number
  next_reset_at?: string | null
}

interface AccountInfo {
  type?: string
  subscription_code?: string
  email?: string | null
  username?: string | null
  buckets?: QuotaBucket[]
}

// 登录时若名下有多个 AI 账号，返回的可选账号
interface LoginAccount {
  id: number
  instance_id: string
  subscription_code: string
  subscription_name: string
}

interface AccountPanelProps {
  /** 当前 gateway_token（来自 aibotSetting 的 dooai_key） */
  token: string
  /** 开通/登录成功后回传 token 与网关 base_url，由父级持久化到 dooai_key/dooai_base_url */
  onAuth: (token: string, baseUrl: string) => void | Promise<void>
  /** 退出后清空 dooai_key */
  onLogout: () => void | Promise<void>
}

interface GatewayResult {
  ok: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any
}

async function gateway(path: string, init?: RequestInit): Promise<GatewayResult> {
  try {
    const res = await fetch(`/ai/gateway${path}`, init)
    const json = await res.json().catch(() => null)
    return { ok: res.ok && json?.code === 200, json }
  } catch {
    return { ok: false, json: null }
  }
}

function authHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }
}

// 账号信息按 token 缓存到 localStorage：打开面板先渲染缓存、再静默刷新，避免每次抖动
const ACCOUNT_CACHE_KEY = "dooai:account-cache"

function readAccountCache(token: string): AccountInfo | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_CACHE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    return o && o.token === token ? (o.account as AccountInfo) : null
  } catch {
    return null
  }
}

function writeAccountCache(token: string, account: AccountInfo) {
  try {
    localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify({ token, account }))
  } catch {
    // 忽略写入失败（隐私模式等）
  }
}

// 重置时间：<1h 显示剩余分钟；<24h 显示 时:分；其余显示 月-日（本地）
function fmtReset(iso: string | null | undefined, lang: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  const diff = d.getTime() - Date.now()
  const p = (n: number) => String(n).padStart(2, "0")
  if (diff < 3600000) {
    const m = Math.max(0, Math.round(diff / 60000))
    return lang === "zh" ? `${m} 分钟` : `${m}min`
  }
  if (diff < 86400000) return `${p(d.getHours())}:${p(d.getMinutes())}`
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const AccountPanel = ({ token, onAuth, onLogout }: AccountPanelProps) => {
  const { t, lang } = useI18n()
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [mode, setMode] = useState<"view" | "login" | "claim" | "select">("view")
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [selectAccounts, setSelectAccounts] = useState<LoginAccount[]>([])

  const [loginForm, setLoginForm] = useState({ login: "", password: "" })
  const [claimForm, setClaimForm] = useState({ username: "", password: "", email: "", code: "" })

  // silent=true 时（后台/缓存刷新）失败不弹错，避免打扰
  const loadMe = useCallback(async (tk: string, silent = false) => {
    if (!tk) {
      setAccount(null)
      return
    }
    const { ok, json } = await gateway("/me", { headers: authHeaders(tk) })
    if (ok) {
      const data = json.data as AccountInfo
      setAccount(data)
      writeAccountCache(tk, data)
    } else if (!silent) {
      messageError(t("sheet.account.loadFailed"))
    }
  }, [t])

  // 打开/换 token 时：先用缓存即时渲染，再静默刷新（防抖动）
  useEffect(() => {
    if (!token) {
      setAccount(null)
      return
    }
    const cached = readAccountCache(token)
    if (cached) setAccount(cached)
    void loadMe(token, true)
  }, [token, loadMe])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await loadMe(token, false)
    } finally {
      setRefreshing(false)
    }
  }

  // 账号失效（登出 / Reset 清空 token 等）时复位表单态，避免停在 login/claim 出现空白按钮区
  useEffect(() => {
    if (!token) {
      setMode("view")
      setSelectAccounts([])
    }
  }, [token])

  const fetchBaseUrl = useCallback(async (): Promise<string> => {
    const { ok, json } = await gateway("/config")
    return ok && json?.data?.base_url ? String(json.data.base_url) : ""
  }, [])

  const handleProvision = async () => {
    setBusy(true)
    try {
      const baseUrl = await fetchBaseUrl()
      const { ok, json } = await gateway("/provision", { method: "POST" })
      const tk = json?.data?.gateway_token
      if (!ok || !tk) {
        throw new Error(t("sheet.account.provisionFailed"))
      }
      await onAuth(String(tk), baseUrl)
    } catch (error) {
      messageError(error instanceof Error ? error.message : t("sheet.account.provisionFailed"))
    } finally {
      setBusy(false)
    }
  }

  // 用 App Store 账号登录：首次不带 account_id；名下多账号时后端返回列表，选中后带 account_id 再请求。
  // 网关地址(instance_id)由 AI 插件后端 /gateway/login 注入。
  const performLogin = async (accountId?: number) => {
    setBusy(true)
    try {
      const baseUrl = await fetchBaseUrl()
      const body: Record<string, unknown> = { ...loginForm }
      if (accountId) body.account_id = accountId
      const { ok, json } = await gateway("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!ok) {
        throw new Error(t("sheet.account.loginFailed"))
      }
      const tk = json?.data?.gateway_token
      if (tk) {
        await onAuth(String(tk), baseUrl)
        setMode("view")
        setLoginForm({ login: "", password: "" })
        setSelectAccounts([])
        return
      }
      // 名下多个账号：进入选择态
      if (json?.data?.need_select && Array.isArray(json.data.accounts)) {
        setSelectAccounts(json.data.accounts as LoginAccount[])
        setMode("select")
        return
      }
      throw new Error(t("sheet.account.loginFailed"))
    } catch (error) {
      messageError(error instanceof Error ? error.message : t("sheet.account.loginFailed"))
    } finally {
      setBusy(false)
    }
  }

  const handleLogin = () => performLogin()
  const handleSelectAccount = (id: number) => performLogin(id)

  const handleSendCode = async () => {
    if (!claimForm.email) return
    setBusy(true)
    try {
      const { ok } = await gateway("/email/send", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ email: claimForm.email }),
      })
      if (!ok) {
        messageError(t("sheet.account.sendCodeFailed"))
      }
    } finally {
      setBusy(false)
    }
  }

  const handleClaim = async () => {
    setBusy(true)
    try {
      const { ok } = await gateway("/claim", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(claimForm),
      })
      if (ok) {
        setMode("view")
        setClaimForm({ username: "", password: "", email: "", code: "" })
        await loadMe(token)
      } else {
        messageError(t("sheet.account.claimFailed"))
      }
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    setBusy(true)
    try {
      const { ok, json } = await gateway("/logout", { method: "POST", headers: authHeaders(token) })
      // 退出 = 让 token 失效并清本地凭据。后端作废成功，或 token 本就失效（401 invalid token，
      // 如已在别处退出/过期）都视为已退出——否则会因拿着已失效 token 反复 401 而「一直无法退出」。
      // 仅当确属可重试的失败（网络/5xx，token 可能仍有效）才提示，但无论如何都清本地完成退出。
      const tokenAlreadyInvalid = json?.error?.type === "invalid_request_error"
      if (!ok && !tokenAlreadyInvalid) {
        messageError(t("sheet.account.logoutFailed"))
      }
      setAccount(null)
      await onLogout()
    } finally {
      setBusy(false)
    }
  }

  const signedIn = Boolean(token)
  const isAnonymous = account?.type !== "claimed"

  // 额度桶 kind → 友好文案；未知 kind 回退到原始值，避免直接暴露字段名
  const bucketLabel = (kind: string): string => {
    if (kind === "rolling_5h") return t("sheet.account.bucketRolling5h")
    if (kind === "weekly") return t("sheet.account.bucketWeekly")
    return kind
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-semibold">{t("sheet.account.title")}</Label>
        {signedIn ? (
          <Badge variant={isAnonymous ? "outline" : "secondary"} className="font-normal">
            {isAnonymous ? t("sheet.account.anonymous") : t("sheet.account.claimed")}
          </Badge>
        ) : (
          <Badge variant="outline" className="font-normal">
            {t("sheet.account.notSignedIn")}
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{t("sheet.account.privacyNote")}</p>

      {!signedIn && (
        <p className="text-xs text-muted-foreground">{t("sheet.account.intro")}</p>
      )}

      {/* 已登录：所属账号 + 余额 + 操作 */}
      {signedIn && account && (
        <div className="space-y-2">
          {account.email && (
            <div className="text-xs text-muted-foreground">
              {t("sheet.account.boundAccount")}: {account.email}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {t("sheet.account.balance")}
          </div>
          <div className="space-y-1">
            {(account.buckets ?? []).map((b) => {
              const percent = b.amount > 0 ? Math.min(100, Math.max(0, Math.round((b.balance / b.amount) * 100))) : 0
              const reset = fmtReset(b.next_reset_at, lang)
              return (
                <div key={b.kind} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{bucketLabel(b.kind)}</span>
                  <span>
                    {percent}%
                    {reset && <span className="ml-1.5 text-muted-foreground">· {reset}</span>}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 登录表单 */}
      {!signedIn && mode === "login" && (
        <div className="space-y-2">
          <Input
            placeholder={t("sheet.account.username") + " / " + t("sheet.account.email")}
            value={loginForm.login}
            onChange={(e) => setLoginForm((p) => ({ ...p, login: e.target.value }))}
          />
          <Input
            type="password"
            placeholder={t("sheet.account.password")}
            value={loginForm.password}
            onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
          />
        </div>
      )}

      {/* 多账号选择 */}
      {!signedIn && mode === "select" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("sheet.account.selectTitle")}</p>
          {selectAccounts.map((a) => (
            <Button
              key={a.id}
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              className="w-full justify-between"
              onClick={() => handleSelectAccount(a.id)}
            >
              <span>{a.subscription_name || a.subscription_code || t("sheet.account.selectFallback")}</span>
              <span className="text-xs text-muted-foreground font-mono">{a.instance_id}</span>
            </Button>
          ))}
        </div>
      )}

      {/* 认领表单 */}
      {signedIn && isAnonymous && mode === "claim" && (
        <div className="space-y-2">
          <Input
            placeholder={t("sheet.account.username")}
            value={claimForm.username}
            onChange={(e) => setClaimForm((p) => ({ ...p, username: e.target.value }))}
          />
          <Input
            type="password"
            placeholder={t("sheet.account.password")}
            value={claimForm.password}
            onChange={(e) => setClaimForm((p) => ({ ...p, password: e.target.value }))}
          />
          <Input
            placeholder={t("sheet.account.email")}
            value={claimForm.email}
            onChange={(e) => setClaimForm((p) => ({ ...p, email: e.target.value }))}
          />
          <div className="flex gap-2">
            <Input
              placeholder={t("sheet.account.code")}
              value={claimForm.code}
              onChange={(e) => setClaimForm((p) => ({ ...p, code: e.target.value }))}
            />
            <Button type="button" variant="outline" disabled={busy || !claimForm.email} onClick={handleSendCode}>
              {t("sheet.account.sendCode")}
            </Button>
          </div>
        </div>
      )}

      {/* 操作按钮区 */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {!signedIn && mode === "view" && (
          <>
            <Button type="button" size="sm" disabled={busy} onClick={handleProvision}>
              {t("sheet.account.provision")}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setMode("login")}>
              {t("sheet.account.login")}
            </Button>
          </>
        )}
        {!signedIn && mode === "login" && (
          <>
            <Button type="button" size="sm" disabled={busy} onClick={handleLogin}>
              {t("sheet.account.login")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setMode("view")}>
              {t("sheet.account.cancel")}
            </Button>
          </>
        )}
        {!signedIn && mode === "select" && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setMode("login")
              setSelectAccounts([])
            }}
          >
            {t("sheet.account.cancel")}
          </Button>
        )}
        {signedIn && mode !== "claim" && (
          <>
            {isAnonymous && (
              <Button type="button" size="sm" disabled={busy} onClick={() => setMode("claim")}>
                {t("sheet.account.claim")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || refreshing}
              onClick={handleRefresh}
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                t("sheet.account.refresh")
              )}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={handleLogout}>
              {t("sheet.account.logout")}
            </Button>
          </>
        )}
        {signedIn && mode === "claim" && (
          <>
            <Button type="button" size="sm" disabled={busy} onClick={handleClaim}>
              {t("sheet.account.submit")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setMode("view")}>
              {t("sheet.account.cancel")}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
