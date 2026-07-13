import { useCallback, useEffect, useRef, useState } from "react"

import { Loader2 } from "lucide-react"

import { messageError, messageSuccess, modalError, getBaseUrl } from "@dootask/tools"

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
  instance_id?: string
  subscription_code?: string
  subscription_name?: string
  email?: string | null
  username?: string | null
  buckets?: QuotaBucket[]
  // 积分钱包：flat 永久额度，无 reset 周期，与订阅额度桶分开展示
  credit_balance?: number
  // 扣费优先级：subscription_first=订阅优先 / wallet_first=积分优先
  wallet_priority?: string
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
  /** 增量同步网关模型（token 不变时触发：认领成功 / 手动刷新 / 检测到套餐变化） */
  onSyncModels: () => void | Promise<void>
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

// 从网关响应体提取后端真实错误 message：兼容 App Store 的 {code,message,data}
// 与 AI 网关的 {error:{message}} 两种格式；取不到返回空串。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gatewayError(json: any): string {
  const m = json?.message ?? json?.error?.message
  return typeof m === "string" ? m.trim() : ""
}

// 在固定文案后追加后端真实错误：如「登录失败：invalid or expired verification code」。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withDetail(base: string, json: any): string {
  const detail = gatewayError(json)
  return detail ? `${base}：${detail}` : base
}

// 取当前 DooTask 站点 origin（仅协议+域名+端口）：容器内只有内网地址，故由前端经 @dootask/tools 提供。
async function siteOrigin(): Promise<string> {
  try {
    const base = await getBaseUrl()
    return base ? new URL(base).origin : ""
  } catch {
    return ""
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

export const AccountPanel = ({ token, onAuth, onLogout, onSyncModels }: AccountPanelProps) => {
  const { t, lang } = useI18n()
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [mode, setMode] = useState<"view" | "login" | "claim" | "select">("view")
  const [sendingCode, setSendingCode] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [selectAccounts, setSelectAccounts] = useState<LoginAccount[]>([])
  // 发码冷却倒计时（秒）：成功后置 60，匹配后端同邮箱 1 分钟限频，倒计时期间禁用发码按钮
  const [cooldown, setCooldown] = useState(0)

  // 统一禁用判定：发码或主操作进行中时，所有可点按钮禁用
  const pending = sendingCode || submitting

  const [loginForm, setLoginForm] = useState({ email: "", code: "" })
  const [claimForm, setClaimForm] = useState({ email: "", code: "" })
  // 上一次已知的套餐标识：用于在 loadMe 里检测「套餐升级/变化」→ 自动增量同步模型（B）
  const prevSubscriptionRef = useRef<string | undefined>(undefined)
  // 上一次已知的积分余额：用于检测「买了积分（0→>0）」→ 自动增量同步模型。
  // 积分对全部启用模型生效，买积分后网关 /v1/models 会多返回模型，但买积分不改 subscription_code，
  // 故单独按余额跨越 0 触发。同步只增不删：余额归 0 不会移除已加入的模型。
  const prevCreditRef = useRef<number | undefined>(undefined)
  // 稳定引用父级同步回调：父级每次渲染都传新函数，若直接进 loadMe 依赖会导致挂载 effect 反复重跑
  const onSyncModelsRef = useRef(onSyncModels)
  useEffect(() => {
    onSyncModelsRef.current = onSyncModels
  }, [onSyncModels])

  // 发码冷却每秒递减
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((n) => (n <= 1 ? 0 : n - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  // silent=true 时（后台/缓存刷新）失败不弹错，避免打扰
  const loadMe = useCallback(async (tk: string, silent = false) => {
    if (!tk) {
      setAccount(null)
      return
    }
    const { ok, json } = await gateway("/me", { headers: authHeaders(tk) })
    if (ok) {
      const data = json.data as AccountInfo
      const prevSub = prevSubscriptionRef.current
      const prevCredit = prevCreditRef.current
      setAccount(data)
      writeAccountCache(tk, data)
      prevSubscriptionRef.current = data.subscription_code
      prevCreditRef.current = data.credit_balance
      // B：套餐变化（此前已知且不同，如升级），或积分余额从 0 变正（买了积分）→ 自动增量同步网关模型。
      // 只触发 0→>0：归 0 时同步无新增项、纯 no-op，无需触发（且同步只增不删，不会移除模型）。
      const subChanged = prevSub !== undefined && prevSub !== data.subscription_code
      const creditGainedFromZero =
        typeof prevCredit === "number" && prevCredit <= 0 && typeof data.credit_balance === "number" && data.credit_balance > 0
      if (subChanged || creditGainedFromZero) {
        void onSyncModelsRef.current()
      }
    } else if (!silent) {
      messageError(withDetail(t("sheet.account.loadFailed"), json))
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
    // 以缓存的套餐/积分作为「上一次已知值」基线：面板关闭期间若发生套餐升级或买积分，本次 loadMe 即可检测到并同步
    prevSubscriptionRef.current = cached?.subscription_code
    prevCreditRef.current = cached?.credit_balance
    void loadMe(token, true)
  }, [token, loadMe])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await loadMe(token, false)
      // A：刷新为用户主动操作，无论套餐是否变化都强制增量同步一次（去重由父级护栏保证）
      await onSyncModels()
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
    setSubmitting(true)
    try {
      const baseUrl = await fetchBaseUrl()
      const { ok, json } = await gateway("/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_origin: await siteOrigin() }),
      })
      const tk = json?.data?.gateway_token
      if (!ok || !tk) {
        throw new Error(withDetail(t("sheet.account.provisionFailed"), json))
      }
      await onAuth(String(tk), baseUrl)
    } catch (error) {
      messageError(error instanceof Error ? error.message : t("sheet.account.provisionFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  // 用 App Store 账号登录：首次不带 account_id；名下多账号时后端返回列表，选中后带 account_id 再请求。
  // 网关地址(instance_id)由 AI 插件后端 /gateway/login 注入。
  const performLogin = async (accountId?: number) => {
    setSubmitting(true)
    try {
      const baseUrl = await fetchBaseUrl()
      const body: Record<string, unknown> = { email: loginForm.email, code: loginForm.code, lang, site_origin: await siteOrigin() }
      if (accountId) body.account_id = accountId
      const { ok, json } = await gateway("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!ok) {
        throw new Error(withDetail(t("sheet.account.loginFailed"), json))
      }
      const tk = json?.data?.gateway_token
      if (tk) {
        await onAuth(String(tk), baseUrl)
        setMode("view")
        setLoginForm({ email: "", code: "" })
        setSelectAccounts([])
        messageSuccess(t("sheet.account.loginSuccess"))
        return
      }
      // 名下多个账号：进入选择态
      if (json?.data?.need_select && Array.isArray(json.data.accounts)) {
        setSelectAccounts(json.data.accounts as LoginAccount[])
        setMode("select")
        return
      }
      throw new Error(withDetail(t("sheet.account.loginFailed"), json))
    } catch (error) {
      modalError(error instanceof Error ? error.message : t("sheet.account.loginFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogin = () => performLogin()
  const handleSelectAccount = (id: number) => performLogin(id)

  // 发送邮箱验证码（scene=ai_claim，登录/认领共用端点）。
  // 登录态尚无 token（开放端点，仅按邮箱+IP 限流）；认领态带 gateway_token。
  // purpose 区分发码用途：login=登录（登录邮件文案），claim=认领（认领邮件文案）。
  const sendEmailCode = async (email: string, headers: HeadersInit, purpose: "login" | "claim") => {
    if (!email) return
    setSendingCode(true)
    try {
      const { ok, json } = await gateway("/email/send", {
        method: "POST",
        headers,
        body: JSON.stringify({ email, lang, purpose }),
      })
      if (ok) {
        setCooldown(60)
        messageSuccess(t("sheet.account.sendCodeSuccess"))
      } else {
        modalError(withDetail(t("sheet.account.sendCodeFailed"), json))
      }
    } finally {
      setSendingCode(false)
    }
  }

  // 认领区发码：带 gateway_token
  const handleSendCode = () =>
    sendEmailCode(claimForm.email, authHeaders(token), "claim")

  // 登录区发码：未登录态，不带 token（开放端点）
  const handleSendLoginCode = () =>
    sendEmailCode(loginForm.email, { "Content-Type": "application/json" }, "login")

  const handleClaim = async () => {
    setSubmitting(true)
    try {
      const { ok, json } = await gateway("/claim", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ email: claimForm.email, code: claimForm.code, lang, site_origin: await siteOrigin() }),
      })
      if (ok) {
        setMode("view")
        setClaimForm({ email: "", code: "" })
        await loadMe(token)
        messageSuccess(t("sheet.account.claimSuccess"))
        await onSyncModels()
      } else {
        modalError(withDetail(t("sheet.account.claimFailed"), json))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    setSubmitting(true)
    try {
      const { ok, json } = await gateway("/logout", { method: "POST", headers: authHeaders(token) })
      // 退出 = 让 token 失效并清本地凭据。后端作废成功，或 token 本就失效（401 invalid token，
      // 如已在别处退出/过期）都视为已退出——否则会因拿着已失效 token 反复 401 而「一直无法退出」。
      // 仅当确属可重试的失败（网络/5xx，token 可能仍有效）才提示，但无论如何都清本地完成退出。
      const tokenAlreadyInvalid = json?.error?.type === "invalid_request_error"
      if (!ok && !tokenAlreadyInvalid) {
        messageError(withDetail(t("sheet.account.logoutFailed"), json))
      }
      setAccount(null)
      await onLogout()
    } finally {
      setSubmitting(false)
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

  // 额度健康色随主题分亮/暗两套（主题由 URL 注入、每次挂载固定，读一次 class 即可）：
  // 充足=绿 / 偏低=琥珀 / 紧张=红。仅进度条着色，其余保持单色克制。
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  const health = isDark
    ? { green: "#40c057", amber: "#f0a92b", red: "#fa5252" }
    : { green: "#2f9e44", amber: "#e8850c", red: "#e03131" }
  const quotaColor = (percent: number): string =>
    percent >= 50 ? health.green : percent >= 20 ? health.amber : health.red

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-semibold">{t("sheet.account.title")}</Label>
        {signedIn ? (
          <Badge variant={isAnonymous ? "outline" : "secondary"} className="font-normal">
            {account?.subscription_name || (isAnonymous ? t("sheet.account.anonymous") : t("sheet.account.claimed"))}
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

      {/* 已登录：所属账号 + 额度/积分（Codex 风：左标题+重置，右进度条+剩余%） */}
      {signedIn && account && (() => {
        const buckets = account.buckets ?? []
        const hasCredit = typeof account.credit_balance === "number"
        const rowCount = buckets.length + (hasCredit ? 1 : 0)
        return (
          <div className="space-y-2">
            {account.email && (
              <div className="text-xs text-muted-foreground">
                {t("sheet.account.boundAccount")}: {account.email}
                {account.instance_id && (
                  <span className="ml-1 font-mono">({account.instance_id})</span>
                )}
              </div>
            )}
            {rowCount > 0 && (
              <div className="divide-y divide-border rounded-lg border bg-background">
                {buckets.map((b) => {
                  const percent = b.amount > 0 ? Math.min(100, Math.max(0, Math.round((b.balance / b.amount) * 100))) : 0
                  const reset = fmtReset(b.next_reset_at, lang)
                  const color = quotaColor(percent)
                  return (
                    <div key={b.kind} className="flex items-center gap-4 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium leading-tight">{bucketLabel(b.kind)}</div>
                        {reset && (
                          <div className="mt-1 text-xs text-muted-foreground">{t("sheet.account.resetPrefix")}{reset}</div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        {/* 进度条按余量着色，其余单色 */}
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
                        </div>
                        <span className="w-[3.75rem] text-right text-xs text-muted-foreground tabular-nums">
                          {t("sheet.account.remaining")} {percent}%
                        </span>
                      </div>
                    </div>
                  )
                })}
                {/* 积分钱包：同排版，右侧为绝对余额（无进度条）；优先级仅在与订阅额度并存时作副标题 */}
                {hasCredit && (
                  <div className="flex items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium leading-tight">{t("sheet.account.creditBalance")}</div>
                      {buckets.length > 0 && (account.credit_balance ?? 0) > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t("sheet.account.walletPriorityLabel")}{lang === "zh" ? "：" : ": "}
                          {account.wallet_priority === "wallet_first"
                            ? t("sheet.account.walletPriorityWallet")
                            : t("sheet.account.walletPrioritySubscription")}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {account.credit_balance}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{t("sheet.account.creditUnit")}</span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* 登录表单：邮箱 + 验证码（与认领统一） */}
      {!signedIn && mode === "login" && (
        <div className="space-y-2">
          <Input
            placeholder={t("sheet.account.email")}
            value={loginForm.email}
            onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))}
          />
          <div className="flex items-center rounded-md border border-input bg-transparent shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
            <Input
              placeholder={t("sheet.account.code")}
              value={loginForm.code}
              onChange={(e) => setLoginForm((p) => ({ ...p, code: e.target.value }))}
              className="border-0 shadow-none focus-visible:ring-0"
            />
            <Button type="button" variant="ghost" className="shrink-0 rounded-none rounded-r-md border-l border-input" disabled={pending || cooldown > 0 || !loginForm.email} onClick={handleSendLoginCode}>
              {sendingCode && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {cooldown > 0 ? `${cooldown}s` : t("sheet.account.sendCode")}
            </Button>
          </div>
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
              disabled={pending}
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
            placeholder={t("sheet.account.email")}
            value={claimForm.email}
            onChange={(e) => setClaimForm((p) => ({ ...p, email: e.target.value }))}
          />
          <div className="flex items-center rounded-md border border-input bg-transparent shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
            <Input
              placeholder={t("sheet.account.code")}
              value={claimForm.code}
              onChange={(e) => setClaimForm((p) => ({ ...p, code: e.target.value }))}
              className="border-0 shadow-none focus-visible:ring-0"
            />
            <Button type="button" variant="ghost" className="shrink-0 rounded-none rounded-r-md border-l border-input" disabled={pending || cooldown > 0 || !claimForm.email} onClick={handleSendCode}>
              {sendingCode && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {cooldown > 0 ? `${cooldown}s` : t("sheet.account.sendCode")}
            </Button>
          </div>
        </div>
      )}

      {/* 操作按钮区 */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {!signedIn && mode === "view" && (
          <>
            <Button type="button" size="sm" disabled={pending} onClick={handleProvision}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("sheet.account.provision")}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setMode("login")}>
              {t("sheet.account.login")}
            </Button>
          </>
        )}
        {!signedIn && mode === "login" && (
          <>
            <Button type="button" size="sm" disabled={pending} onClick={handleLogin}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("sheet.account.login")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setMode("view")}>
              {t("sheet.account.cancel")}
            </Button>
          </>
        )}
        {!signedIn && mode === "select" && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
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
              <Button type="button" size="sm" disabled={pending} onClick={() => setMode("claim")}>
                {t("sheet.account.claim")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || refreshing}
              onClick={handleRefresh}
            >
              {refreshing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("sheet.account.refresh")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={handleLogout}>
              {t("sheet.account.logout")}
            </Button>
          </>
        )}
        {signedIn && mode === "claim" && (
          <>
            <Button type="button" size="sm" disabled={pending} onClick={handleClaim}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("sheet.account.claimSubmit")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setMode("view")}>
              {t("sheet.account.cancel")}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
