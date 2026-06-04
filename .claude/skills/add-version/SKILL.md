---
name: add-version
description: 为 DooTask OnlyOffice(office) 插件新增一个 OnlyOffice 版本目录：pull 指定版镜像→启容器→复制官方资源→套用 DooTask 定制（JS 注入/CSS 追加/去 logo）→生成版本目录与正确的 docker-compose 挂载。用户要「升级/适配 OnlyOffice 新版本」「加一个 9.x 版本」时使用。
---

# 新增 OnlyOffice 版本

DooTask 的 OnlyOffice 插件**不自建镜像**，而是直接用官方 `onlyoffice/documentserver` 镜像，再通过 volume 挂载把少量定制资源覆盖进去。每个 OnlyOffice 版本一个目录（如 `dootask-plugin/9.2.0/`），因为定制文件里有**每版都变的 webpack 哈希**，所以新版必须重新提取资源并改挂载。

本技能把整套流程脚本化。**唯一以旧版本目录为权威范本**（当前是 `dootask-plugin/9.2.0/`）。

## 版本号约定（重要）

- **目录名用 3 段**（如 `9.4.0`），与现有 `9.2.0` 一致，作为 AppStore 版本号。
- **镜像 tag 用官方 4 段**（如 `9.4.0.1`），写在 `docker-compose.yml` 的 `image:` 里。
- pull 镜像**必须用具体 4 段版本号**，禁止 `9.4` 或 `latest`（资源哈希要可复现）。

下文以「目录 `9.4.0` / 镜像 `9.4.0.1`」为例，按实际版本替换。

## 前置

- 本机可用 Docker。
- 镜像约 1.3GB，pull + 启动需要时间。

## 步骤

设：`PLUGIN=dootask-plugin`，`PREV=9.2.0`（上一版本目录），`VER=9.4.0`，`IMG=9.4.0.1`，
技能目录 `SKILL=.claude/skills/add-version`。

### 1. pull 官方镜像（具体版本号）

```bash
docker pull onlyoffice/documentserver:9.4.0.1
```

### 2. 启动容器

```bash
docker run -d --name onlyoffice-extract onlyoffice/documentserver:9.4.0.1
# 等服务把 web-apps 资源铺好（首次启动会解压/生成），约 20-40s
sleep 30
```

### 3. 创建新版本目录骨架（从上一版复制可复用部分）

```bash
mkdir -p dootask-plugin/9.4.0
# header logo 是跨版本通用的静态空白 svg（路径固定、无哈希），直接沿用
cp -r dootask-plugin/9.2.0/resources dootask-plugin/9.4.0/resources   # 占位，编辑器资源下一步会被覆盖
cp dootask-plugin/9.2.0/nginx.conf   dootask-plugin/9.4.0/nginx.conf
cp dootask-plugin/9.2.0/config.yml   dootask-plugin/9.4.0/config.yml
```
> 只有 `resources/common/.../img/header/`（空白 logo）需要保留，编辑器的 css/require.js 会在第 4 步被官方原始文件覆盖。

### 4. 复制官方原始资源

```bash
.claude/skills/add-version/copy-resources.sh dootask-plugin/9.4.0
```
脚本会：定位运行中的 onlyoffice 容器 → 复制 `default.json`、`require.js`、三个编辑器的 `main app.css` 与 **mobile chunk**（按内容标记 `navbar-with-logo` 自动定位，不依赖固定 chunk 号）。结束时会打印各 mobile chunk 的实际哈希文件名 —— 记下它们，第 6 步要用。

### 5. 套用 DooTask 定制（幂等）

```bash
.claude/skills/add-version/apply-customizations.sh dootask-plugin/9.4.0
```
套用三类定制（权威片段在 `.claude/skills/add-version/patches/`，逐字提取自 9.2.0）：
1. `require.js` 前置注入 `patches/require-head.js`：清 `ui-theme-id`、向父窗口 postMessage、注入「链接/历史」工具栏按钮、`disableDownload`。
2. 三个 `main/.../app.css` 末尾追加 `patches/main-append.css`（隐藏 logo / about / loading logo / 禁用下载按钮）。
3. 三个 `mobile/css/<hash>.css` 末尾追加 `patches/mobile-append.css`（隐藏带 logo 的 navbar / 禁用下载）。

> header logo 不在脚本里处理：第 3 步已从 9.2.0 拷过来。若新版官方改了 logo 路径或尺寸，再人工调。

### 6. 更新 docker-compose.yml（每版必改）

以 `9.2.0/docker-compose.yml` 为模板复制并改两处：

```bash
cp dootask-plugin/9.2.0/docker-compose.yml dootask-plugin/9.4.0/docker-compose.yml
```

**(a) 镜像 tag**：`onlyoffice/documentserver:9.2.0.1` → `onlyoffice/documentserver:9.4.0.1`。

**(b) 三个 mobile css 挂载**：把旧哈希文件名换成第 4/5 步打印的新哈希名（左右两侧路径都要换）。当前新哈希名：
```bash
ls -1 dootask-plugin/9.4.0/resources/*/mobile/css/
```
其余挂载（`require.js`、三个 main `app.css`、`default.json`、`header/`）是固定路径，**不用动**。

挂载清单（固定不变的部分，供核对）：
- `etc/documentserver/default.json`
- `resources/require.js`
- `resources/common/main/resources/img/header`（logo 目录）
- `resources/<editor>/main/resources/css/app.css` ×3
- `resources/<editor>/mobile/css/<hash>.css` ×3 ← **仅此三行随版本改名**

### 7. 自检

```bash
# 定制是否都套上了
grep -l _toolbarClick dootask-plugin/9.4.0/resources/require.js
grep -rl "left-btn-about{display:none}" dootask-plugin/9.4.0/resources/*/main/resources/css/app.css   # 应 3 个
grep -rl "navbar-with-logo{height:0px}" dootask-plugin/9.4.0/resources/*/mobile/css/                  # 应 3 个
# docker-compose 挂载左侧文件是否都存在
grep -oE '\./[^:]+' dootask-plugin/9.4.0/docker-compose.yml | while read p; do
  [ -e "dootask-plugin/9.4.0/$p" ] && echo "OK  $p" || echo "MISS $p"
done
```

可选实跑验证：用新 `docker-compose.yml` 起插件，浏览器打开编辑器确认 logo 已隐藏、工具栏出现「链接/历史」按钮、移动端 navbar 收起。

### 8. 补充版本元信息

- `dootask-plugin/9.4.0/config.yml`：沿用 9.2.0 的 hooks（`chmod 644 -R ./*`）即可。
- 新增 `dootask-plugin/9.4.0/CHANGELOG.md` 和 `CHANGELOG_zh.md`（AppStore 更新说明）——写法见 release-plugin 技能。

### 9. 清理

```bash
docker rm -f onlyoffice-extract
```

完成后即可用 release-plugin 技能发布。

## 常见坑

- **mobile chunk 号变了**：本技能按内容标记 `navbar-with-logo` 定位，已规避硬编码 526/923/611。若脚本报「未找到含 navbar-with-logo 的 chunk」，说明该版 OnlyOffice 改了移动端结构，需进容器人工排查目标 css（`docker exec <id> sh -c 'grep -rl navbar-with-logo .../mobile/css/'`）。
- **忘了换 mobile 哈希名**：docker-compose 左侧文件不存在 → 挂载成空目录 / 容器报错。第 7 步自检能抓到。
- **用了 9.4 / latest 拉镜像**：哈希不可复现，下次构建对不上。务必 4 段具体号。
- **header logo 丢失**：copy-resources.sh **不**复制 logo 目录，必须在第 3 步从上一版 cp 过来，否则会露出 OnlyOffice 品牌。
- **default.json**：默认整份沿用官方。如历史版本对它有定制，先 `diff` 旧版与新提取的 default.json 再决定保留哪些改动。
