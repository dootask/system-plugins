# search — Manticore 智能搜索插件

引擎（官方 manticoresearch 镜像）+ 管理员状态仪表盘（`src/`，TanStack Start 单镜像全栈）双服务。appid `search`，**版本号 = Manticore 引擎版本**（如 `29.9.0`），仪表盘镜像 `dootask/search:<版本>` 随版本目录走。

## 本地参考：先读本地，别联网

查 DooTask API / 约定 / 主程序行为时优先读本机源码，**别上网搜 DooTask**。`ref:xxx` 按「本地路径存在就读 → 否则 `git clone --depth=1 https://github.com/<在线仓库> ${DOOTASK_REFS:-/tmp/dootask-refs}/<repo>` 后读」获取：

| 代表词 | 用途 | 本机本地路径 | 在线仓库 |
| --- | --- | --- | --- |
| `ref:dootask` | 主程序源码（同步命令/锁/缓存约定都在这） | `/home/coder/workspaces/dootask` | `kuaifan/dootask`（公开） |
| `ref:tools` | `@dootask/tools` 前端库 + Node SDK | `/home/coder/workspaces/dootask-tools` | `dootask/tools`（公开） |
| `ref:crm` | 同栈样板·TanStack Start | `/home/coder/workspaces/dootask-plugins/crm` | `dootask/crm`（公开） |

## 与主程序的内部约定（唯一耦合点）

仪表盘「插件直连」：引擎走 `search:9306`，失败表/管理员列表走主库（`DB_*`），同步锁/模型缓存直读主程序 Redis（db 1）。**全部约定登记在 `src/src/lib/conventions.ts`**——主程序改了命令签名/缓存前缀/表名，只改这一个文件。

## 雷区

- **mysql2 连 Manticore** 必须 `flags: ['-CONNECT_WITH_DB']`（否则 "no such database"）+ `typeCast` 按 buffer 自解 UTF-8（否则 emoji 乱码）；只用 `query()` 不用 `execute()`（引擎不支持二进制预处理协议）。
- **CSS 产物必须无 hash 文件名**（vite.config 的 assetFileNames）：SSR 与客户端环境对同一 styles.css 生成的 hash 不同，带 hash 时 SSR 渲染的 `<link>` 404。
- **basePath 四处一致**，全是 `/apps/search`：`src/vite.config.ts` 的 `base`、`src/src/router.tsx` 的 `basepath`、版本目录 `nginx.conf` 的 `location`、`config.yml` 的 `menu_items.url`。nginx 上游写显式端口 `http://search-dashboard:3000`；assets 那条 location 剥前缀、页面那条不剥。
- compose 服务名 `search` 是引擎（主程序按此名连 9306），仪表盘叫 `search-dashboard`——共享 docker 网络里别起泛名（如 `dashboard`）防别的应用撞名。
- 所有仪表盘接口过 `requireAdmin`（token 反查主程序 + identity 含 admin），**不要**改成信任前端 user-id 的轻量模型——这里有清索引/重建这类破坏性操作。
- `@dootask/tools` 两侧别混用：前端侧依赖 window（SSR 下动态 `import()`），后端侧 `DooTaskClient` 连 `http://nginx`。
- **引擎非正常停机后「表缺失」≠ 表坏**：binlog 元数据登记了已不存在的日志文件会让 searchd 每次启动 FATAL 退出（表本身完好），compose 靠 `--replay-flags=ignore-open-errors` 跳过、`stop_grace_period: 120s` 给大索引落盘时间，init.sh 再兜底把其他类 binlog 损坏改名备份。别一上来就删/挪 binlog 目录——会丢掉里面尚未落盘的写入，那只是兜底。仪表盘用 `engineTables()` 区分 引擎离线/表未加载/表缺失，别再把所有查询失败都当「缺失」。
- 引擎升级 = 新建版本目录 + 改镜像 tag + init.sh 清卷逻辑（`COMPATIBLE_PREV` 里是已实测可沿用数据的旧版本，升级到它不清库；新增前先用现网数据拷贝在隔离容器里实测加载/查询/建表写入）；仪表盘代码改动也要**升版本号**才能发布（AppStore 拒绝同版本重发）。

## 命令

```bash
cd src && pnpm install && pnpm dev        # 本地开发（脱离宿主自动降级）
cd src && pnpm build && npx tsc --noEmit  # 构建 + 类型检查
docker build -t dootask/search:<版本> -f src/Dockerfile src   # tag 必须 = 版本目录名
# 本地整包验证（doo 已登录）：技能 dootask:create-plugin 的
#   scripts/upload_to_appstore.sh <本目录> <版本> kuaifan → doo app install ...
# 注意：本机已装的是系统应用 `search`，community_* 上传是另一个 appid，服务名会撞；
#   开发期验证仪表盘可单容器起 .output 挂进 dootask 网络冒烟（见 git 历史）。
```

## 目录

`src/` 仪表盘源码+Dockerfile；`<版本>/` 版本目录（config.yml/docker-compose.yml/nginx.conf/init.sh/openapi.yaml/CHANGELOG）；`.build.yml` 构建配置；`ai-kb/` AI 助手知识库。引擎无自建镜像、直接用官方镜像 + `init.sh`（版本切换时清数据卷触发主程序全量重建）。
