---
name: release-plugin
description: 发布本仓库（DooTask 系统插件集合）里的某个插件新版本：确认/补全版本目录与中英 CHANGELOG，推送 `<插件>/<版本>` tag 触发 GitHub Action，以系统应用方式发布到 DooTask AppStore。用户要发版/打 tag/出新版本时使用。
---

# 发布 DooTask 系统插件

本仓库是 DooTask **系统插件集合**（office、drawio、face、fileview、minder、mysql-expose-port、search …），每个插件一个顶层目录。发布靠**推送 `<插件>/<版本>` 形式的 tag** 触发 `.github/workflows/release.yml`：

工作流是**通用、零硬编码**的——从 tag 解析出插件名与版本，按目录约定打包发布：
- `appid` = 插件目录名（与 AppStore 一致）
- `is_system_app` = true（全是系统插件）
- 打包 = `<插件>/{config.yml,logo*,README*}` + 目标 `<插件>/<版本>/` + **其它非版本子目录（如 `icon/`、`ai-kb/`）**；`src/`、其它版本目录、点文件不入包。

**多数插件不构建 Docker 镜像**（直接用官方镜像 + 挂载定制资源，或纯 compose/nginx），发布只需打包目录。**少数插件需要构建镜像**：若插件目录有 `.build.yml`（目前 `ai`、`approve`、`okr`、`face`、`minder`），工作流会先按其中的 image/context/dockerfile 构建并推送 Docker 镜像（`image:<版本>` 和 `:latest`），再打包发布——这类插件的源码在 `<插件>/src/`。

OnlyOffice(office) 新版本资源的制作不在这里 —— 那是 [[office-add-version]] 技能的工作；本技能负责把已就绪的版本目录发布出去。

## 三个非踩不可的点

1. **tag = `<插件>/<版本>`**，例如 `office/9.4.0`、`drawio/24.7.17`、`mysql-expose-port/1.0.0`。插件名 = 目录名 = appid；版本 = 3/4 段都行但要等于版本目录名，**不带 `v` 前缀**。工作流会校验 `<插件>/config.yml` 和 `<插件>/<版本>/` 存在，否则失败。
2. **一个 tag 只发一个插件的一个版本**。AppStore 不允许重复版本号；仓库里保留多个版本目录没问题，发布时按 tag 选一个。
3. **版本号只增不重复**。误推的 tag 删了也撤不回已发布版本，重发只能换号。

> 注意：纯版本号 tag（如 `9.4.0`，无斜杠）**不会**触发工作流（`on.push.tags` 只匹配 `*/*`）。历史上 office 曾用过无斜杠 tag，现已统一为 `office/<版本>`。

## 前置

- 仓库已配好远程并能推送。
- Repository Secrets：`DOOTASK_USERNAME` / `DOOTASK_PASSWORD`（所有发布都需要）。发布需构建镜像的插件（含 `.build.yml`，即 ai/approve/okr/face/minder）还需 `DOCKER_USERNAME` / `DOCKER_PASSWORD`。均由管理员一次性配置，本技能不负责设置。

## 发布流程

每步先与用户确认 —— 发布是公开且不可逆的。下面以发布 `office/9.4.0` 为例，按实际插件/版本替换。

### 1. 确认插件与版本目录就绪

```bash
ls                                  # 顶层插件目录，如 office drawio face ...
ls office/                          # 确认目标版本目录存在，如 9.4.0
```
office 新版本资源若没做好，先用 [[office-add-version]] 技能生成。

**发布前自检（按 `config.yml` 的声明核对随包内容）** —— 凡是声明了下面字段的插件，发布前逐项确认，避免把过时/不一致的内容发出去：

- **声明了 `openapi` 时**：引用的规范文件存在（静态 `file` 写法在版本目录/应用目录可解析）；是合法 OpenAPI 3.x / Swagger 2.0；`service` / `port` 与**本版本** `docker-compose.yml` 的服务名、容器内端口一致；声明的路径与后端实际路由匹配；**没把鉴权头（`Token` / `X-Doo-User-*`）写成必填参数**（这些由主程序自动注入）。
- **声明了 `knowledge_base: ./ai-kb` 时**：顶层 `ai-kb/` 目录存在（非版本子目录，会随包）；内容与**本版本真实功能**一致、无旧版/已删功能残留；frontmatter 合法、chunk `id` 全局唯一且带应用前缀。**镜像构建型插件（改过 `src/`）尤其要核对 ai-kb 是否同步更新**。
- **`require_version`**：版本门槛与本版本依赖的主程序能力一致（如用到 `doo app call` / 知识库等需较新主程序）。

### 2. 确认状态干净

```bash
git fetch && git status
git log --oneline -10
```
工作区干净、在 `main`、与远程同步。

### 3. 更新该版本的 CHANGELOG（中英双语）

编辑（无则新建）：
- `<插件>/<版本>/CHANGELOG.md`（英文）
- `<插件>/<版本>/CHANGELOG_zh.md`（中文）

**覆盖式**写本次更新，不保留历史、不写版本号和日期（AppStore 自己维护历史）。面向最终用户、一句一条、中英分类与条数一一对应。常用分类：

| 英文 | 中文 |
|------|------|
| Added | 新增 |
| Fixed | 修复 |
| Updated | 更新 |
| Changed | 变更 |
| Improved | 优化 |
| Removed | 移除 |

### 4. 提交并推送

```bash
git add <插件>/<版本>/
git commit -m "release: office 9.4.0"
git push origin main
```

### 5. 打 tag 并推送（触发发布）

```bash
git tag office/9.4.0            # ⚠️ <插件>/<版本>，不带 v，且等于目录名
git push origin office/9.4.0
```
> 推上去立即触发 Action，没回头路。推前再确认插件/版本号、CHANGELOG 已在 main。
> 误推可 `git push --delete origin office/9.4.0 && git tag -d office/9.4.0`（已发布到 AppStore 则删 tag 不撤回）。

### 6. 监控 Action

```bash
gh run list --workflow=release.yml --limit 3
gh run watch
```
或浏览器：`https://github.com/dootask/system-plugins/actions`

### 7. 验证

DooTask AppStore 中对应插件（appid = 插件目录名）出现新版本，更新说明显示本次 CHANGELOG。

## 发布失败时

- **Parse & validate tag 失败**：tag 不是 `<插件>/<版本>` 形式，或 `<插件>/config.yml`、`<插件>/<版本>/` 不存在。改对 tag 重推。
- **AppStore 发布失败**：查 `<插件>/config.yml`、`<插件>/<版本>/` 配置是否合法，以及 `DOOTASK_USERNAME` / `DOOTASK_PASSWORD` 是否有效。
- **版本号已存在**：AppStore 不允许重复，换一个未用过的版本号（需对应新建版本目录）。
- **Action 没触发**：确认 tag 真的推到了远程，且是含斜杠的 `<插件>/<版本>` 形式（纯版本号不触发）。

## 升级已有插件到新版本

适用于所有插件（含构建镜像型 ai/approve/okr/face/minder——它们没有各自的发布技能，统一用本技能）：

1. 复制当前版本目录为新版本号：`cp -r <插件>/<旧版本> <插件>/<新版本>`。构建镜像型的 `docker-compose.yml` 用 `${PLUGIN_VERSION}`，**镜像 tag 无需改**。若插件声明了 `openapi` 且规范文件放在版本目录内（如 `0.2.0/openapi.yaml`），`cp -r` 会一并带到新版本目录——记得与改后的后端路由对齐。
2. 构建镜像型若改了程序，改 `<插件>/src/` 下源码。改了 `src/` 别忘了同步更新顶层 `ai-kb/`（若有声明 `knowledge_base`）。
3. 更新 `<插件>/<新版本>/CHANGELOG.md` 和 `CHANGELOG_zh.md`（覆盖式，见上文写法）。
4. 按上文「发布前自检」核对 openapi / ai-kb / require_version，再提交推 `main`，最后打 `<插件>/<新版本>` tag 触发发布。

## 新增一个插件到本仓库

新增插件**不需要改工作流**：在仓库根建一个以 appid 命名的目录（`<appid>/config.yml`、`logo`、`README`、`<版本>/...`），然后照上面流程推 `<appid>/<版本>` tag 即可。需构建镜像就再加 `src/` 与 `.build.yml`（镜像名用 `dootask/<appid>`）。
