---
name: release-plugin
description: 发布 DooTask OnlyOffice(office) 插件新版本：确认/补全版本目录与中英 CHANGELOG，打 tag 触发 GitHub Action，以系统应用方式发布到 DooTask AppStore（appid office）。用户要发版/打 tag/出新版本时使用。
---

# 发布 DooTask OnlyOffice 插件

发布靠**推送 tag** 触发 `.github/workflows/release.yml`：打包 `dootask-plugin/<tag>/` 这一个版本目录，以系统应用（`is_system_app: true`）方式发布到 DooTask AppStore（appid `office`）。

**本插件不构建 Docker 镜像**（直接用官方 `onlyoffice/documentserver` 镜像 + 挂载定制资源），所以发布只需打包目录，比 memos/approval 少了镜像构建环节。

新增 OnlyOffice 版本资源本身不在这里 —— 那是 [[add-version]] 技能的工作；本技能负责把已就绪的版本目录发布出去。

## 三个非踩不可的点

1. **tag 名 = 版本目录名 = AppStore 版本号**，用 **3 段**（如 `9.4.0`），**不带 `v` 前缀**。workflow 会校验 `dootask-plugin/<tag>/` 必须存在，否则直接失败。
2. **只发 tag 对应的那一个版本**。AppStore 不允许重复版本号，所以 workflow 不会把仓库里其他版本目录（如旧的 `9.2.0`）一起打包。仓库里保留多个版本目录没问题，发布时按 tag 选一个。
3. **版本号只增不重复**。AppStore 拒绝重复版本号；误推的 tag 删了也撤不回已发布版本。重发只能换号。

## 前置：仓库与 Secrets

- 该工作目录需是 GitHub 仓库且配好远程（workflow 才会跑）。若 `git status` 报 not a repo，先 `git init` 并推到 GitHub（仓库名建议 `dootask/onlyoffice`）。
- 仓库 Secrets 需配置 `DOOTASK_USERNAME` / `DOOTASK_PASSWORD`（管理员一次性配置，本技能不负责设置）。不需要 Docker 相关 secrets。

## 发布流程

每步先与用户确认再操作 —— 发布是公开且不可逆的（DooTask AppStore）。

### 1. 确认版本目录就绪

```bash
ls dootask-plugin/                 # 确认有目标版本目录，如 9.4.0
```
若资源还没做好，先用 [[add-version]] 技能生成。

### 2. 确认状态干净

```bash
git fetch && git status
git log --oneline -10
```
工作区干净、在 `main`、与远程同步。

### 3. 更新该版本的 CHANGELOG（中英双语）

编辑（无则新建）：
- `dootask-plugin/<版本>/CHANGELOG.md`（英文）
- `dootask-plugin/<版本>/CHANGELOG_zh.md`（中文）

**覆盖式**写本次更新，不保留历史、不写版本号和日期（AppStore 自己维护历史）。面向最终用户、一句一条、中英分类与条数一一对应。常用分类：

| 英文 | 中文 |
|------|------|
| Added | 新增 |
| Fixed | 修复 |
| Updated | 更新 |
| Changed | 变更 |
| Improved | 优化 |
| Removed | 移除 |

OnlyOffice 升级版本时，典型条目如「Updated / 更新：升级 OnlyOffice 文档服务器至 9.4.0」。

### 4. 提交并推送

```bash
git add dootask-plugin/<版本>/
git commit -m "release: OnlyOffice 9.4.0"
git push origin main
```

### 5. 打 tag 并推送（触发发布）

```bash
git tag 9.4.0            # ⚠️ 3 段、不带 v，且等于版本目录名
git push origin 9.4.0
```
> 推上去立即触发 Action，没回头路。推前再确认版本号、CHANGELOG 已在 main。
> 误推可 `git push --delete origin 9.4.0 && git tag -d 9.4.0`（已发布到 AppStore 则删 tag 不撤回）。

### 6. 监控 Action

```bash
gh run list --workflow=release.yml --limit 3
gh run watch
```
或浏览器：`https://github.com/dootask/onlyoffice/actions`

### 7. 验证

DooTask AppStore 中 `office` 插件出现新版本，更新说明显示本次 CHANGELOG。

## 发布失败时

- **校验版本目录失败**：tag 名和 `dootask-plugin/<tag>/` 不一致，或目录不存在。改对 tag 名重推。
- **AppStore 发布失败**：查 `dootask-plugin/config.yml`、`dootask-plugin/<版本>/config.yml`/`docker-compose.yml` 是否合法，以及 `DOOTASK_USERNAME` / `DOOTASK_PASSWORD` 是否有效。
- **版本号已存在**：AppStore 不允许重复，换一个未用过的版本号（需对应新建版本目录）。
- **Action 没触发**：确认 tag 真的推到了远程（仅 `git tag` 不 push 不触发）。
