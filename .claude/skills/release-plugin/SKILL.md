---
name: release-plugin
description: 发布本仓库（DooTask 系统插件集合）里的某个插件新版本：确认/补全版本目录与中英 CHANGELOG，推送 `<插件>/<版本>` tag 触发 GitHub Action，以系统应用方式发布到 DooTask AppStore。用户要发版/打 tag/出新版本时使用。
---

# 发布 DooTask 系统插件

本仓库是 DooTask **系统插件集合**（office、drawio、face、fileview、minder、mysql-expose-port、search …），每个插件一个顶层目录。发布靠**推送 `<插件>/<版本>` 形式的 tag** 触发 `.github/workflows/release.yml`：

工作流是**通用、零硬编码**的——从 tag 解析出插件名与版本，按目录约定打包发布：
- `appid` = 插件目录名（与 AppStore 一致）
- `is_system_app` = true（全是系统插件）
- 打包 = `<插件>/{config.yml,logo*,README*}` + 仅 `<插件>/<版本>/`

**本仓库的插件都不构建 Docker 镜像**（直接用官方镜像 + 挂载定制资源，或纯 compose/nginx），所以发布只需打包目录。

OnlyOffice(office) 新版本资源的制作不在这里 —— 那是 [[add-version]] 技能的工作；本技能负责把已就绪的版本目录发布出去。

## 三个非踩不可的点

1. **tag = `<插件>/<版本>`**，例如 `office/9.4.0`、`drawio/24.7.17`、`mysql-expose-port/1.0.0`。插件名 = 目录名 = appid；版本 = 3/4 段都行但要等于版本目录名，**不带 `v` 前缀**。工作流会校验 `<插件>/config.yml` 和 `<插件>/<版本>/` 存在，否则失败。
2. **一个 tag 只发一个插件的一个版本**。AppStore 不允许重复版本号；仓库里保留多个版本目录没问题，发布时按 tag 选一个。
3. **版本号只增不重复**。误推的 tag 删了也撤不回已发布版本，重发只能换号。

> 注意：纯版本号 tag（如 `9.4.0`，无斜杠）**不会**触发工作流（`on.push.tags` 只匹配 `*/*`）。历史上 office 曾用过无斜杠 tag，现已统一为 `office/<版本>`。

## 前置

- 仓库已配好远程并能推送。
- Repository Secrets：`DOOTASK_USERNAME` / `DOOTASK_PASSWORD`（管理员一次性配置，本技能不负责设置）。不需要 Docker 相关 secrets。

## 发布流程

每步先与用户确认 —— 发布是公开且不可逆的。下面以发布 `office/9.4.0` 为例，按实际插件/版本替换。

### 1. 确认插件与版本目录就绪

```bash
ls                                  # 顶层插件目录，如 office drawio face ...
ls office/                          # 确认目标版本目录存在，如 9.4.0
```
office 新版本资源若没做好，先用 [[add-version]] 技能生成。

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

## 新增一个插件到本仓库

新增插件**不需要改工作流**：在仓库根建一个以 appid 命名的目录（`<appid>/config.yml`、`logo`、`README`、`<版本>/...`），然后照上面流程推 `<appid>/<版本>` tag 即可。
