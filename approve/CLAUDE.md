# approve 插件 — 给 AI 的项目说明

DooTask 审批中心，appid `approve`，跑在主程序 iframe 里。**已从旧 Go/Flowable 引擎重写为自包含全栈插件**：TanStack Start（file-router + Nitro SSR）+ React 19 + Tailwind v4 + shadcn/ui（`radix-ui`）+ SQLite（better-sqlite3, WAL）。立项与方案见 `REWRITE_PLAN.md`。下面只记从代码看不出、容易判断错的点。

## 先读本地，别联网
查 DooTask API / 约定 / 主程序行为时**读本地源码，不要上网搜**：
- 主程序：`/home/coder/workspaces/dootask`
- `@dootask/tools`（前端库 + 各 SDK）：`/home/coder/workspaces/dootask-tools`
- 工程范本：`crm`（TanStack Start 骨架/机器人）、`asset-hub`（消息中心 open-micro-app 卡片）
- 旧实现参考：`approve/.legacy-go/`（Flowable 式 Go 引擎 + `workflow-vue3` 设计器），仅作算法/语义参考，已不参与构建。

## 命令（都在 `approve/src/` 下跑）
- 开发：`pnpm dev`（端口 3000）
- 构建：`pnpm build`（Vite+Nitro，esbuild **不做类型检查**）
- 类型检查：`npx tsc --noEmit`（构建/CI 不跑，改完自己跑）
- Lint / 格式化：`pnpm lint` / `pnpm format`
- 测试：`pnpm test`（vitest）
- 改路由文件后重生成路由树：`pnpm generate-routes`（`tsr generate`，会改 `src/routeTree.gen.ts`）
- 本机起生产包：`APPROVE_DATA_DIR=/tmp/x APPROVE_ADMIN_USER_IDS=1 PORT=3000 node .output/server/index.mjs`
- 构建镜像 / 发版：用 `release-plugin` 技能（镜像 `dootask/approve`，`.build.yml` 指 context=src）

## 目录：有两层 src
工程根 `approve/src/`，应用代码在 `approve/src/src/`（TanStack srcDirectory 也叫 src），导入别名 `#/` = `src/`：
- `routes/` 页面 + `routes/api/` 后端接口（handler 返回 `Response.json`）
- `components/views/` 列表多视图 · `components/detail/` 详情 · `components/designer/` 流程+表单设计器 · `components/form/` 动态表单渲染 · `components/ui/` shadcn
- `lib/engine/` 审批状态机（线性 `NodeInfo[]` + 会签计数）· `lib/form/` 表单 schema/校验 · `lib/repo/` 数据访问 · `lib/migrate/` 旧库迁移 · `lib/seed/` 内置模板
- `lib/{db,auth,api,dootask,dootask-server,engine-deps}.ts`
- 版本目录 `approve/0.2.0/`：`config.yml`、`docker-compose.yml`、`nginx.conf`、CHANGELOG

## basePath / nginx（同 crm 范式）
vite `base:'/apps/approve/'` + router `basepath:'/apps/approve'`。Nitro 静态资源在容器根 `/assets`（不带 base），`nginx.conf` 单独把 `/apps/approve/assets/` 剥前缀转发 `/assets/`，页面与 `/api/*` 不剥。**验资源要单独 curl 一个 `/apps/approve/assets/*.js`**，页面 200 不代表资源能加载。这三处（vite base、router basepath、nginx location、menu_items.url）必须完全一致。

## 审批引擎（雷区，迁移续跑的硬约束）
- 发起时把流程树 `flow_nodes` **展开成线性 `NodeInfo[]`** 存 `proc_inst.node_sequence`；运行期只读这个序列，**指针 `cur_node_seq_idx` = 数组索引**（对齐旧引擎 Step）。
- **条件分支（route）在展开时按 `formData` 求值定死**，不在运行期动态求值——这是迁移后能与旧引擎逐节点比对的前提。改 `lib/engine/flow.ts` 的展开逻辑务必保持这点。
- 会签靠 `proc_task.pending_count` 递减（==0 且无拒绝即通过）；抄送/发起人自审是 `isSystem` 节点，引擎自动跳过、不产生待办。
- `settype:'leader'`（部门主管）的节点 `directorLevel=N` 会**展开成 1..N 共 N 个审批节点**（nodeId 拼 `-1`/`-2`…），不是单节点。无主管的层级被跳过。
- `lib/engine/types.ts` 的 `ApprovalEngine` 接口用**函数属性**写法（`fn: (...) => T`），不是方法简写——eslint `method-signature-style` 会拦方法简写。

## 内置模板（`lib/seed/builtin.ts`）
请假/加班/报销/差旅/评审 5 个，**首启幂等播种**（db.ts 在迁移完成后调 `ensureBuiltinSeeded`）：仅当库内无任何模板时注入，避免与迁移带入/管理员自建冲突；播种后写 `sys_settings.builtin_seeded`。管理员补播走 `POST /api/admin/seed`。审批人默认用 `settype:'leader'`（播种时不知具体 userid），报销含金额 route 分流（>5000 走两级主管）。

## 旧库迁移（`lib/migrate/`）
首启一次性 MySQL→SQLite（`db.ts` 触发 `ensureMigrated`），幂等（`sys_settings.migrated_at`）、只读老表不删、单事务原子。进行中流程映射运行时状态后由新引擎续跑。管理员手动入口 `POST /api/admin/migrate`。旧库连接走 docker-compose 注入的 `DB_*` 变量。

## 国际化（`lib/i18n/`）
宿主用入口 URL `?lang=` 传语言（与 `?theme=` 同源）。支持 9 种 `DooTaskLanguage`（zh/zh-CHT/en/ko/ja/de/fr/id/ru），**未知 lang 回退英文**（`DEFAULT_LOCALE='en'`）。取译走**回退链**（`locale.ts` 的 `localeChain`）：先自身语言、再中间回退、最后英文；目前 **`zh-CHT` 缺译文先回退简体 `zh` 再英文**（繁体读者要中文不要英文）。补某语言译文后其链路自然命中该语言。
- 词条目录 `lib/i18n/messages/*.ts`：每条 `{ zh, en, ...可选 }`，按域分模块（common/shell/detail/lists/designer/form/stats/backup/uiMisc/server/engine）汇总到 `messages/index.ts`。**缺某语言自动回退 en**；补译只需给词条加 `ko:` 等字段，不改框架。**key 全局唯一**（合并是展开，撞名后者覆盖；加键先 grep）。
- 客户端：组件内 `const t = useT()`（`#/lib/i18n/context`）→ `t('key', { name })`，`{name}` 插值。语言由 `LocaleProvider` 在入口 URL 取一次并冻结（SSR/客户端首帧一致、应用内 `<Link>` 跳转丢 `?lang` 也不变）。**只翻用户可见串**（JSX 文本/按钮/placeholder/aria/toast/错误兜底），中文注释保留。
- 非 React 的展示串生产函数（`form/validate.ts`、`designer/utils.ts` 等）走**参数注入 `t: TFunc`**，调用方（组件传 `useT()`、服务端传 `serverT(request)`）传入；测试传 `makeT('zh')`。
- 服务端：接口错误/机器人通知按**触发请求的用户语言**渲染（非按收件人）。`serverT(request)`（读 `x-lang` 头，前端 `api()` 自动带；回退 `?lang=`）。引擎/流程抛 `EngineError(key, params)`，在 handler 边界 `t(e.key, e.params)` 翻译；`validateFlowTree(root, t)` 直接收 t。
- **未做（已知，按范围决定）**：内置模板/字段标签等 SQLite 数据（`seed/builtin.ts`）、迁移/db 日志、`dootask-server.ts` 上传异常与 `用户#id` 兜底、引擎写入 `proc_event` 的系统 remark（`退回后重新提交`/`转交给X`/`自动通过…`，详情时间线按写入时语言显示）、`uploads.ts` 的 `未命名文件`/`附件` 兜底文件名。

## 鉴权（`lib/auth.ts`）
身份取请求头 `x-user-token`，**服务端用它调主程序反查真实 userid**（不直接信任 `x-user-id`，防伪造越权）。管理员 = 反查 userid 在 `APPROVE_ADMIN_USER_IDS` 内。数据目录由 `APPROVE_DATA_DIR` 决定（容器挂 `approve-data:/app/data`）。

## 其它坑（同 crm）
- `@dootask/tools` 分前端侧（`lib/dootask.ts`，依赖 window，**动态 import 避免 SSR 崩**）与服务端侧（`lib/dootask-server.ts` 的 `DooTaskClient` 以 token 调 `http://nginx`），别混用。
- 列表页内容在 `components/views/`，路由文件占位、由 keep-alive 挂载；改列表改 views/。
- Radix 用统一 `radix-ui` 包；Select 的 value 不能是空字符串（用哨兵值）。
- 消息中心待办用 asset-hub 范式的 `open-micro-app` 卡片点开详情页 `insts/$id`。
