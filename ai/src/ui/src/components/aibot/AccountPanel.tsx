import { useCallback, useEffect, useState } from "react"

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
  tier_code?: string
  email?: string | null
  username?: string | null
  buckets?: QuotaBucket[]
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

export const AccountPanel = ({ token, onAuth, onLogout }: AccountPanelProps) => {
  const { t } = useI18n()
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [mode, setMode] = useState<"view" | "login" | "claim">("view")
  const [busy, setBusy] = useState(false)

  const [loginForm, setLoginForm] = useState({ login: "", password: "" })
  const [claimForm, setClaimForm] = useState({ username: "", password: "", email: "", code: "" })

  const loadMe = useCallback(async (tk: string) => {
    if (!tk) {
      setAccount(null)
      return
    }
    const { ok, json } = await gateway("/me", { headers: authHeaders(tk) })
    if (ok) {
      setAccount(json.data as AccountInfo)
    } else {
      messageError(t("sheet.account.loadFailed"))
    }
  }, [t])

  useEffect(() => {
    void loadMe(token)
  }, [token, loadMe])

  // 账号失效（登出 / Reset 清空 token 等）时复位表单态，避免停在 login/claim 出现空白按钮区
  useEffect(() => {
    if (!token) setMode("view")
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

  const handleLogin = async () => {
    setBusy(true)
    try {
      const baseUrl = await fetchBaseUrl()
      const { ok, json } = await gateway("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      })
      const tk = json?.data?.gateway_token
      if (!ok || !tk) {
        throw new Error(t("sheet.account.loginFailed"))
      }
      await onAuth(String(tk), baseUrl)
      setMode("view")
      setLoginForm({ login: "", password: "" })
    } catch (error) {
      messageError(error instanceof Error ? error.message : t("sheet.account.loginFailed"))
    } finally {
      setBusy(false)
    }
  }

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
      const { ok } = await gateway("/logout", { method: "POST", headers: authHeaders(token) })
      if (!ok) {
        messageError(t("sheet.account.logoutFailed"))
        return
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

      {/* 已登录：余额 + 操作 */}
      {signedIn && account && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            {t("sheet.account.balance")}
          </div>
          <div className="flex flex-wrap gap-2">
            {(account.buckets ?? []).map((b) => {
              const percent = b.amount > 0 ? Math.round((b.balance / b.amount) * 100) : 0
              return (
                <Badge key={b.kind} variant="secondary" className="font-normal">
                  {bucketLabel(b.kind)}: {percent}%
                </Badge>
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
        {signedIn && mode !== "claim" && (
          <>
            {isAnonymous && (
              <Button type="button" size="sm" disabled={busy} onClick={() => setMode("claim")}>
                {t("sheet.account.claim")}
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => loadMe(token)}>
              {t("sheet.account.refresh")}
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
