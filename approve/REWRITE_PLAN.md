# 审批中心重写方案（approve 插件全栈自包含化）

> 状态：方案稿（待评审）　|　目标读者：DooTask 研发/产品　|　最后更新：2026-06-15
>
> 本文是"把审批中心整体重写成自包含插件、从主程序解耦"的立项方案。结论基于对以下代码的实读：
> 主程序 `~/workspaces/dootask`、现有 `approve` 插件 `~/workspaces/dootask-plugins/system-plugins/approve`、
> 范本 `~/workspaces/dootask-plugins/crm`（TanStack Start）与 `~/workspaces/dootask-plugins/asset-hub`（消息中心对接）、
> 官方规范 `create-plugin` 技能 + `@dootask/tools`。

---

## 0. 决策摘要（已定 / 待拍板）

**已定**（前序讨论结论）：
- 形态：**整体重写**为自包含全栈插件，**主程序不再保留审批的页面与接口**。
- 技术栈：**TanStack Start 全栈**（React 19 + Tailwind v4 + shadcn/ui），对齐样板 `crm`。
- 集成：**iframe 微应用**（非 internal/inline），`@dootask/tools` 取身份、后端 `DooTaskClient` 回调主程序。
- 消息中心：审批机器人发待办消息、消息可点开插件自己的详情页（对齐 `asset-hub`）。
- 推进：**先出本方案文档**，评审通过后再开工。

**已拍板**（2026-06-15）：
1. 代码仓库：**留在 `system-plugins`**（沿用扁平布局 + `.build.yml`，`src/` 换成 TanStack Start 工程）。
2. 数据库：**全量 SQLite**（回到 crm 范式，数据层照搬 crm，不写 MySQL 适配）。
3. 历史数据：**首次运行一次性迁移**——旧主程序 MySQL（`approve_ACT_*` 等 Flowable 表）→ 新 SQLite，迁移后新版本只用 SQLite（详见 §9）。
4. 流程设计器：**React 重写**。
5. 上线策略：**直接替换**（无新旧并存；前提见 §9/§12）。
6. 一期业务场景：**现有（请假/加班等）+ 报销 + 评审**（差旅二期）。

---

## 1. 背景与目标

### 1.1 现状的问题
当前"审批"能力**割裂在两处**，且表单写死：
- **Go 引擎插件**（`approve/src`，Flowable 式 `ACT_*` 表）：流程定义/实例/任务流转，前端只有一个 iframe 流程设计器（`workflow-vue3`，单路由 `setting.vue`）。
- **主程序 core**：发起表单、列表、详情、审批卡片、待办/通知全在 core——
  - 代理转发：`app/Http/Controllers/Api/ApproveController.php`（`Ihttp::ihttp_post($flow_url.'/api/v1/workflow/...')`）。
  - 发起/列表/详情/设置页：`resources/assets/js/pages/manage/approve/{index,list,details,setting}.vue`，**表单字段完全写死**（请假/加班，`index.vue` 的 `selectTypes` + `indexOf('请假')`）。
  - 对话卡片：`DialogView/template/approve-{submitter,reviewer,notifier,comment-notifier}.vue`。
  - 待办/通知：`ApproveProcMsg` 模型 + `approve_proc_msgs` 表 + `WebSocketDialogMsg` 消息卡片 + APP 推送。
- **引擎层强类型写死**：`approve/src/workflow-engine/types/vars.go` 的 `Vars` 只有 5 个字段（type/description/startTime/endTime/other），校验函数只有 `CheckVacateVars`/`CheckOvertimeVars`；入参 `ProcessReceiver.Var *types.Vars`，落库前 `json.Marshal` 过滤，**任何自定义字段都会被丢弃**。

**后果**：客户要的"评审 / 报销 / 差旅"都做不了，根因是**没有自定义表单、没有附件**；且功能横跨 core 与插件，迭代要改两个仓库、受 core 排期制约。

### 1.2 目标
1. **自包含**：发起、审批、列表、详情、流程设计、表单设计、待办通知，全部在插件内；主程序只负责"加载入口 + 提供身份/选人/文件/发消息"等通用能力。
2. **自定义表单 + 附件**：任意审批表单可配置（评审/报销/差旅/用章/采购……），含文件上传。
3. **解耦**：删除 core 内全部 approve 专属页面与接口。
4. **平滑升级**：appid 仍为 `approve`，版本号接续，老用户升级即换新。

### 1.3 范围
- **In**：审批引擎、自定义表单引擎、全套前端、消息中心对接、core 拆除、数据迁移、发布。
- **Out（本期不做）**：电子签章、跨表单数据联动、对接外部财务/HR 系统、BI 报表。

---

## 2. 技术选型（对齐 crm）

| 层 | 选型 | 依据 |
|---|---|---|
| 前端框架 | TanStack Start（file-router + Nitro SSR）+ React 19 | `crm/src/package.json` |
| 样式/组件 | Tailwind v4 + shadcn/ui（统一 `radix-ui` 包，非 `@radix-ui/react-*`） | `crm/CLAUDE.md` |
| 后端 | TanStack Start `routes/api/*`（handler 返回 `Response.json`），Node 运行时 | `crm/CLAUDE.md`、`tools.md` |
| 数据库 | **SQLite（better-sqlite3，WAL）+ 数据卷** | `crm/src/src/lib/db.ts`、asset-hub 同范式；见 §12-2 权衡 |
| ORM | 不用 ORM，手写 SQL + `CREATE TABLE IF NOT EXISTS` 幂等迁移 | `crm` `db.ts` `migrate()`/`addColumnIfMissing()` |
| 主程序交互 | `@dootask/tools`：前端动态 `import()`，服务端 `DooTaskClient`（`http://nginx` + token） | `crm/src/src/lib/dootask{,-server}.ts` |
| 打包 | 自建镜像 `dootask/approve`，扁平布局 + `.build.yml` | `crm/.build.yml` |

> **SQLite 说明**：审批是核心业务，数据会持续增长。SQLite（WAL）对单实例 DooTask 的审批写入并发通常足够；但若该实例审批量极大/要多副本，需评估换 MySQL（见 §12-2）。数据层用 `lib/repo/` 收口，便于将来替换驱动。

---

## 3. 总体架构

```
┌──────────────────────── DooTask 主程序 ────────────────────────┐
│  iframe 菜单入口(menu_items: url_type=iframe) → /apps/approve/  │
│  通用能力(被插件调用):用户/部门、选人、文件上传、发机器人消息    │
│  消息中心:渲染 open-micro-app 卡片 → 点开插件详情页            │
└───────────────▲───────────────────────────────▲───────────────┘
                │ @dootask/tools(前端取 token)   │ DooTaskClient(后端用 token 回调)
┌───────────────┴───────────────────────────────┴───────────────┐
│                 approve 插件容器(dootask/approve)               │
│  TanStack Start(Nitro):                                        │
│   routes/        页面(列表/发起/详情/设计器/管理)               │
│   routes/api/    审批引擎接口 + 表单 + 附件 + 机器人回调         │
│   lib/engine/    审批流转状态机(自研)                          │
│   lib/form/      自定义表单 schema 与校验                       │
│   lib/repo/      数据访问(SQLite)                              │
│   lib/dootask{,-server}.ts  主程序桥接                          │
│  SQLite(/app/data, 挂载卷)  +  容器内 cron(时限提醒)          │
└────────────────────────────────────────────────────────────────┘
```

**鉴权链路**（在 crm 轻信任模型上**加固**）：
- 前端 `@dootask/tools.getUserInfo()` 取 `userid` + `token`，随请求带 `x-user-id` / `x-user-token` 头（crm 范式）。
- 后端**不直接信任 `x-user-id`**（asset-hub 的隐患）：用 `x-user-token` 调 `DooTaskClient.getUserInfo()` **反查真实身份**再鉴权，杜绝伪造 userid 越权。结果可短期缓存。
- 管理员/审批管理：fields 配 `user_select`（`APPROVE_ADMIN_USER_IDS`），对比反查到的真实 userid。

---

## 4. 数据模型（SQLite schema 草案）

```sql
-- 流程定义(模板):同时承载"审批节点编排"和"自定义表单 schema"
CREATE TABLE proc_def (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'custom',  -- vacate/overtime/reimburse/travel/review/custom
  icon        TEXT,
  form_schema TEXT NOT NULL DEFAULT '[]',      -- JSON: 字段定义数组(见 §6)
  flow_nodes  TEXT NOT NULL DEFAULT '{}',      -- JSON: 审批节点树(approver/notifier/route)
  start_scope TEXT,                            -- JSON: 可发起范围(部门/角色/人), 空=所有人
  version     INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'enabled', -- enabled/disabled
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 流程实例
CREATE TABLE proc_inst (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  def_id       INTEGER NOT NULL REFERENCES proc_def(id),
  def_version  INTEGER NOT NULL,
  title        TEXT NOT NULL,
  form_data    TEXT NOT NULL DEFAULT '{}',     -- JSON: 按 schema 填写的值
  initiator_id INTEGER NOT NULL,
  dept_id      INTEGER,
  status       TEXT NOT NULL DEFAULT 'running', -- draft/running/approved/rejected/withdrawn/archived
  cur_node_id  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at  TEXT
);

-- 审批任务(一个节点可生成多条:会签/或签)
CREATE TABLE proc_task (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  inst_id      INTEGER NOT NULL REFERENCES proc_inst(id) ON DELETE CASCADE,
  node_id      TEXT NOT NULL,
  node_name    TEXT,
  approve_mode TEXT NOT NULL DEFAULT 'or',     -- and(会签)/or(或签)/seq(依次)
  assignee_id  INTEGER NOT NULL,
  state        TEXT NOT NULL DEFAULT 'pending',-- pending/approved/rejected/transferred/skipped
  comment      TEXT,
  due_at       TEXT,                           -- 时限(评审时间节点)
  acted_at     TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 参与人/抄送人(候选、抄送、加签)
CREATE TABLE proc_actor (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  inst_id   INTEGER NOT NULL REFERENCES proc_inst(id) ON DELETE CASCADE,
  task_id   INTEGER,
  userid    INTEGER NOT NULL,
  role      TEXT NOT NULL,                     -- approver/cc/addsign
  state     TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 操作流水/时间线(同意/拒绝/退回/撤回/转交/加签/评论/归档)
CREATE TABLE proc_event (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  inst_id   INTEGER NOT NULL REFERENCES proc_inst(id) ON DELETE CASCADE,
  task_id   INTEGER,
  actor_id  INTEGER NOT NULL,
  action    TEXT NOT NULL,                     -- submit/approve/reject/return/withdraw/transfer/addsign/comment/archive
  remark    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 附件(引用主程序文件;见 §6 附件方案)
CREATE TABLE proc_attachment (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  inst_id     INTEGER NOT NULL REFERENCES proc_inst(id) ON DELETE CASCADE,
  field_key   TEXT,
  file_id     INTEGER,                         -- 主程序 File id(优先方案)
  local_path  TEXT,                            -- 或插件自存路径(备选)
  name        TEXT, size INTEGER, ext TEXT,
  uploaded_by INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 待办-消息映射(仿 core 的 ApproveProcMsg, 用于点开详情/撤回时回收消息)
CREATE TABLE proc_msg (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  inst_id   INTEGER NOT NULL,
  task_id   INTEGER,
  userid    INTEGER NOT NULL,
  dialog_id INTEGER, msg_id INTEGER,
  kind      TEXT NOT NULL,                     -- reviewer/cc/result/comment
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- KV 系统设置(机器人 token/userid、开关) — 同 crm sys_settings
CREATE TABLE sys_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
```

索引：`proc_task(assignee_id,state)`（待我审批）、`proc_inst(initiator_id,status)`（我发起）、`proc_actor(userid,role)`（抄送我）、`proc_event(inst_id)`（时间线）。

---

## 5. 审批引擎（自研，TS，`lib/engine/`）

沿用现有设计器语义（`workflow-vue3` 的节点结构：`approver` / `notifier` / `route+condition`），但用 TS 重新实现状态机。

**节点类型**：发起人 → 审批人（可多级）→ 抄送人 → 条件分支（route）→ … → 结束/归档。

**审批方式**（节点级）：`or` 或签（一人通过即过）/ `and` 会签（须全部通过）/ `seq` 依次。

**流转动作**：
| 动作 | 说明 | 对应客户诉求 |
|---|---|---|
| submit 提交 | draft→running，按 `flow_nodes` 生成首节点 task | 评审①发起 |
| approve 同意 | 节点满足条件后进入下一节点；route 节点按 `form_data` 求值选分支 | 评审④"二审/通过"分流 |
| reject 拒绝 | 终止（可配置为"退回发起人"） | |
| return 退回 | 回到发起人编辑后重新提交，或退回上一审批节点 | 评审③发起人修改 |
| withdraw 撤回 | 发起人在进行中撤回 | |
| transfer/addsign 转交/加签 | 改 assignee 或新增会签人 | |
| archive 归档 | approved 后由发起人/管理员归档 | 评审⑤归档 |

**条件分流**：route 节点的条件读 `form_data` 字段（数字如金额、下拉如类型），支持 `> < = >= <= 介于`（沿用现有 `conditionDrawer` 语义，但字段来源改为表单 schema，不再写死 `leaveHours`）。→ 满足客户"报销按金额走不同审批层级"。

**时限**：`proc_task.due_at`；容器内 cron（asset-hub `start.sh` 已有挂 cron 的范式）定时扫描，超时发提醒消息/可配置自动通过或转上级。→ 满足"评审时间节点"。

> **移植要点**：现有 Go 引擎的"会签计数、节点推进、条件求值"逻辑可作为算法参考，但 `ACT_*` 表结构不照搬（改用 §4 精简模型）。这是工作量大头之一，需重点测试会签/复杂条件的正确性。

---

## 6. 自定义表单引擎（`lib/form/` + 设计器）

**字段类型**：单行/多行文本、数字、金额、日期、日期范围、下拉、多选、人员（调主程序选人）、部门、**明细子表**（如报销多行费用）、**附件**、说明文字。

**form_schema 结构**（存 `proc_def.form_schema`）：
```jsonc
[
  { "key": "amount", "type": "money", "label": "报销金额", "required": true, "props": { "min": 0 } },
  { "key": "items",  "type": "table", "label": "费用明细", "columns": [ /* 子字段 */ ] },
  { "key": "files",  "type": "file",  "label": "票据附件", "props": { "multiple": true } }
]
```

**三处统一按 schema 动态渲染**：发起页表单、详情页展示、审批/抄送对话卡片。彻底取代 core 里写死的 `index.vue`/`details.vue`/`approve-*.vue`。

**校验**：必填/类型/范围，前端 + 后端双校验（后端按 schema 兜底）。

**内置模板**：请假、加班、报销、差旅、评审 作为预置 `proc_def`（首次启动幂等播种，同 crm `seedOptions`），开箱即用，也可复制改。→ 既兼容老的请假/加班，又交付客户三个新场景。

**附件方案**（优先复用主程序，权限可控）：
- 上传走主程序 `POST /api/file/content/upload` → 拿 `file_id` 存 `proc_attachment`。
- 用 `FileUser` 把附件共享给当前审批参与人（参与人随节点变化时由引擎维护共享），避免越权可见。
- 备选：插件自存数据卷（实现简单，但权限要自己做）——**推荐主程序文件方案**。

---

## 7. 前端（TanStack Start，参照 crm 目录范式）

```
src/src/
  routes/                # 页面 + routes/api/ 后端接口
    api/                 #   /api/defs /api/insts /api/tasks/:id/action /api/upload /api/bot ...
  components/
    views/               # 列表多视图(待我审批/我发起/抄送我/已完成),keep-alive 保活(同 crm)
    detail/              # 详情页区块:表单展示 + 操作条 + 时间线 + 评论
    designer/            # 流程设计器 + 表单设计器(React 重写)
    form/                # 动态表单渲染器(按 schema)
    ui/                  # shadcn
  lib/{db,auth,api,dootask,dootask-server}.ts
  lib/repo/              # 数据访问(SQLite)
  lib/engine/  lib/form/ # 引擎 + 表单
```

**页面清单**：
1. **列表**（多视图保活）：待我审批 / 我发起 / 抄送我 / 已完成。
2. **发起**：选模板 → 动态表单（含附件）→ 提交。
3. **详情**（`$id` 路由）：动态表单展示 + 审批操作（同意/拒绝/退回/转交/加签/评论）+ 时间线 + 归档。
4. **流程设计器**：节点编排（审批人/抄送/条件），React 重写现有 Vue 设计器交互。
5. **表单设计器**：拖拽配置字段 + 绑定到模板。
6. **管理**：模板管理、机器人设置、管理员、内置模板。

**工程约定**（照 crm）：basePath `vite base:'/apps/approve/'` + router `basepath:'/apps/approve'`；nginx 单独剥 `/apps/approve/assets/`；`@dootask/tools` 前端**动态 import**避免 SSR 崩；列表页内容放 `components/views/`（路由文件占位）由 keep-alive 挂载。

---

## 8. 消息中心对接（参照 crm 机器人 + asset-hub 卡片）

- **机器人**：复用 crm `lib/dootask-server.ts` 的 `ensureCrmBot` 范式——首次用操作人 token 创建/复用"审批机器人"、发 `/token` 取机器人 token、存 `sys_settings`；之后用机器人 token 发消息。
- **发待办**：在 提交/审批/结果/抄送/评论 时，对相应人 `sendBotMessage`（asset-hub）/ 私聊发文本（crm `/api/dialog/msg/sendtext`，`update_mark` 控制是否计未读）。`proc_msg` 记录 `dialog_id/msg_id`。
- **可点开详情**：消息体内嵌 asset-hub 范式卡片：
  ```html
  > <div class="open-micro-app" data-app-config='{"id":"approve","name":"approve-detail","url_type":"iframe","immersive":true,"keep_alive":false,"url":"/apps/approve/{system_lang}/insts/<id>?theme={system_theme}"}'>查看审批详情</div>
  ```
  点击 → 主程序以 iframe 微应用打开插件详情页；记录 id 走 URL 路径参数（详情路由 `insts/$id`）。→ **满足"在主程序审批机器人里打开审批详情"**。

---

## 9. core 解耦 / 拆除清单 + 迁移

**主程序需删除/改的**（解耦）：
| core 资产 | 处理 |
|---|---|
| `ApproveController.php`（代理+发消息+ProcMsg） | 删 |
| `routes/web.php` 的 `approve/*` 路由、`config/dootask.php` 的 `flow_url` | 删 |
| `manage/approve/{index,list,details,setting}.vue` | 删 |
| `DialogView/template/approve-*.vue`（4个卡片） | 删（改用 open-micro-app 卡片，由主程序消息渲染器支持 `class=open-micro-app`，asset-hub 已验证可用） |
| `ApproveProcMsg` / `ApproveProcInstHistory` 模型 + `approve_proc_msgs` migration | 逻辑搬入插件；表数据按 §下迁移后下线 |
| `docker/appstore/config/approve/nginx.conf` | 改为新版本目录的 nginx（`/apps/approve/`） |

> 注：拆 core 需要主程序同仓库一并改并发版；插件 `require_version` 应声明依赖支持 `open-micro-app` 卡片的主程序版本。

**数据迁移（首次运行一次性 MySQL → SQLite）**：
- 触发：新版本首次启动跑迁移（升级 hook 或首启自检），**幂等**（`sys_settings` 记 `migrated_at`，已迁则跳过）、**只读老表不删**（失败可重试、保留兜底）、带进度日志。
- 连接：迁移程序用 docker-compose 内置变量（`${DB_HOST}`/`${DB_PORT}`/`${DB_DATABASE}`/`${DB_USERNAME}`/`${DB_PASSWORD}` + 旧前缀 `${DB_PREFIX}approve_`）只读连旧 MySQL。
- 映射：旧 `ACT_RE_PROCDEF`→`proc_def`、`ACT_HI_PROCINST`/历史表→`proc_inst`+`proc_event`、`ACT_RU_TASK`→`proc_task`、`ACT_RU_IDENTITYLINK`→`proc_actor`；旧 `Vars`（请假/加班 5 字段）→ 内置模板的 `form_data`/`form_schema`。
- **进行中流程无缝续跑（已定方案）**：已结束历史单 → 只读历史；**进行中流程**把旧 Flowable 运行时状态映射到新引擎运行时——旧 `ACT_RU_EXECUTION` 当前节点 → `proc_inst.cur_node_id`、`ACT_RU_TASK` → `proc_task`（pending）、`ACT_RU_IDENTITYLINK` → `proc_actor`，迁移后由新引擎直接接着推进。**硬前提**：新引擎的流转语义（会签计数、条件求值、节点 id 体系）必须与旧引擎对齐；迁移后对进行中流程做"影子推进"比对（同状态下新旧引擎推进结果一致）再切。**这是迁移 + 引擎的最高风险点，需专项设计与测试。**
- 旧 MySQL 数据**迁后保留一段时间**作兜底；旧 Go 容器随直接替换下线。

---

## 10. 发布与运维

- **布局**（扁平，照 crm）：`approve/{config.yml, .build.yml, logo.svg, README*, <版本>/, src/}`；`.build.yml`：`image: dootask/approve / context: src / dockerfile: src/Dockerfile`。
- **config.yml**：顶层元数据；版本目录放 `fields`（`APPROVE_ADMIN_USER_IDS: user_select`）+ `menu_items`（`url_type: iframe`，入口 `apps/approve/?...token...`，并可加"应用管理"入口指向设计器/模板管理）。
- **docker-compose**：`image: dootask/approve:${PLUGIN_VERSION}`，挂 `approve-data:/app/data`（SQLite），容器内跑 cron（时限）。
- **nginx**：剥 `/apps/approve/assets/` → `/assets/`，页面与 `/api` 不剥（TanStack basePath 接管）。
- **版本**：appid 保持 `approve`，版本号在现有 `0.1.9` 之上接续（如 `0.2.0`）。**同版本号不可重发**（AppStore 拒重复）。
- **升级 hook**：从旧 Go 版升级到新全栈版，用 `hooks.upgrade.before/after` 跑数据迁移；旧版卸载 hook 清理。
- **发布走 `release-plugin` 技能**（本仓库约定：推 `<插件>/<版本>` tag 触发）；若迁独立仓库则按该仓库的 release 流程（asset-hub 式任意 tag）。

---

## 11. 实施分期与工作量

> 量级粗估，假设 1–2 名前端 + 1 名全栈、含联调测试，**需团队评审细化**，非承诺。

| 阶段 | 内容 | 产出 | 量级 |
|---|---|---|---|
| **P0 骨架** | TanStack Start 工程(照 crm)、`@dootask/tools` 握手、机器人、一条最简审批端到端(发起→审批→机器人卡片点开详情) | 装上可跑、范式打通 | 1–2 周 |
| **P1 引擎+核心页** | 审批状态机(多级/会签/或签/依次/退回/撤回/条件/归档)、列表/发起/详情(先用固定字段) | 完整流转可用 | 3–4 周 |
| **P2 自定义表单** | 表单 schema/校验/动态渲染、表单设计器、流程设计器 React 重写 | 任意表单可配 | 3–4 周 |
| **P3 附件+时限+场景** | 主程序文件附件、时限提醒(cron)、报销(金额分流)/差旅/评审 内置模板 | 三场景交付 | 2–3 周 |
| **P4 拆除+迁移+上线** | core 删页面/接口、数据迁移、灰度上线、文档 | 主程序解耦完成 | 2–3 周 |

合计约 **11–16 周（~3–4 个月）**。可复用项显著降本：crm 的工程骨架 + 机器人代码、asset-hub 的卡片对接、内置模板复用一套表单引擎。

---

## 12. 决策（已定）与残留风险

**已定**（见 §0）：留 `system-plugins`、全量 SQLite、首次一次性迁移、设计器 React 重写、直接替换、一期=现有+报销+评审。

**残留风险（开工/上线要管控）**：
1. **进行中流程无缝续跑**（§9）：迁移 + 引擎的最高风险点。**要求引擎设计阶段即锁定与旧引擎一致的节点 id / 会签 / 条件语义**，迁移后用"影子推进"比对验证，否则迁过来的流程继续推进会错乱。
2. **直接替换无回退**：core 删审批页面与插件上线必须同步；务必拿生产数据快照在测试环境完整演练"迁移 + 流转"后再上线；`require_version` 卡好主程序/插件版本。
3. **一期范围重**：现有+报销+评审已把自定义表单/附件/金额分流/时限全纳入，且直接替换无中间可上线态 ≈ 一次性交付（~11–16 周）。建议内部按里程碑验收（引擎 → 表单/附件 → 报销/评审）。
4. **SQLite 容量**：审批量极大时需复评是否换 MySQL（数据层用 `lib/repo/` 收口，便于替换）。

---

## 附：关键参考（本地，先读别联网）
- 工程骨架：`~/workspaces/dootask-plugins/crm`（TanStack Start）
- 消息中心对接：`~/workspaces/dootask-plugins/asset-hub`
- 现有审批引擎逻辑参考：`~/workspaces/dootask-plugins/system-plugins/approve/src`
- 主程序 API/约定：`~/workspaces/dootask`、`@dootask/tools`：`~/workspaces/dootask-tools`
- 官方规范：`create-plugin` 技能（`config.yml`/`menu_items`/SDK）
