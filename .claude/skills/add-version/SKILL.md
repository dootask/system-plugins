---
name: add-version
description: 为 DooTask OnlyOffice(office) 插件新增一个 OnlyOffice 版本目录：pull 指定版镜像→启容器→复制官方资源→套用 DooTask 定制（JS 注入/CSS 追加/调大体积上限/去 logo）→生成版本目录与正确的 docker-compose 挂载。用户要「升级/适配 OnlyOffice 新版本」「加一个 9.x 版本」时使用。
---

# 新增 OnlyOffice 版本

DooTask 的 OnlyOffice 插件**不自建镜像**，而是直接用官方 `onlyoffice/documentserver` 镜像，再通过 volume 挂载把少量定制资源覆盖进去。每个 OnlyOffice 版本一个目录（如 `office/9.2.0/`），因为定制文件里有**每版都变的 webpack 哈希**，所以新版必须重新提取资源并改挂载。

本技能把整套流程脚本化。**定制内容是用「干净容器 vs 现有插件目录」逐文件 diff 实测固化的**，存在 `patches/` 下，已验证能字节级复现 9.2.0（CSS 仅差装饰性空行）。

## 定制清单（共 5 类，apply 脚本自动套用）

| # | 文件 | 改动 | patch 来源 |
|---|------|------|-----------|
| 1 | `resources/require.js` | 在 license 注释与 `var requirejs,require,define;` 主体**之间**插入一段 IIFE（工具栏 postMessage、注入「链接/历史」按钮、disableDownload、清 ui-theme-id）。**主体不改**。 | `patches/require-head.js` |
| 2 | 三个编辑器 `main/.../app.css` | 末尾追加 5 行（隐藏 logo / about / loading logo / 禁用下载按钮） | `patches/main-append.css` |
| 3 | 三个编辑器 `mobile/css/<hash>.css` | 末尾追加 3 行（隐藏带 logo 的 navbar / 禁用下载） | `patches/mobile-append.css` |
| 4 | `etc/documentserver/default.json` | FileConverter 体积上限 ×10：`maxDownloadBytes` 100MB→1000MB，`uncompressed` 50MB→500MB(×3)、300MB→3000MB | `patches/default-json-edits.tsv` |
| 5 | `resources/common/.../img/header/` | `header-logo_s.svg`、`dark-logo_s.svg` 换成空白 svg（去 OnlyOffice 品牌）；`icons.svg` 不动 | `patches/blank-*.svg` |

> 三个编辑器的 main 追加块彼此一致、mobile 追加块彼此一致，所以去重后只有 2 个 CSS patch，由脚本循环套到 6 个文件上。

## 版本号约定（重要）

- **目录名用 3 段**（如 `9.4.0`），与现有 `9.2.0` 一致，作为 AppStore 版本号。
- **镜像 tag 用官方 4 段**（如 `9.4.0.1`），写在 `docker-compose.yml` 的 `image:` 里。
- pull 镜像**必须用具体 4 段版本号**，禁止 `9.4` 或 `latest`（资源哈希要可复现）。

下文以「目录 `9.4.0` / 镜像 `9.4.0.1`」为例，按实际版本替换。

## 前置

- 本机可用 Docker；镜像约 1.7GB（压缩）/ 5.8GB（解压），pull + 启动需要时间。
- `python3`（apply 脚本用它做 default.json 的字面替换）。

## 步骤

设：`VER=9.4.0`（新目录），`IMG=9.4.0.1`（镜像），`PREV=9.2.0`（上一版本目录）。
所有命令在仓库根目录执行。

### 1. pull 官方镜像（具体 4 段版本号）

```bash
docker pull onlyoffice/documentserver:9.4.0.1
```

### 2. 启动干净容器（不挂载任何插件文件）

```bash
docker rm -f oo-extract 2>/dev/null
docker run -d --name oo-extract onlyoffice/documentserver:9.4.0.1 >/dev/null
sleep 30   # 等 web-apps 资源铺好（首次启动会解压/生成）
docker exec oo-extract ls /var/www/onlyoffice/documentserver/web-apps/vendor/requirejs/require.js
```

### 3. 创建新版本目录骨架

```bash
mkdir -p office/9.4.0
cp office/9.2.0/nginx.conf office/9.4.0/nginx.conf
cp office/9.2.0/config.yml office/9.4.0/config.yml   # 仅 chmod 钩子，跨版本通用
```
> 不用从旧版 cp resources —— 下一步 copy-resources.sh 会把含 header 在内的所有资源都从容器里取新鲜的。

### 4. 复制官方原始资源

```bash
.claude/skills/add-version/copy-resources.sh office/9.4.0
```
脚本会从运行中的 onlyoffice 容器复制：`default.json`、`require.js`、header 目录、三个编辑器的 `main app.css` 与 **mobile chunk**（按内容标记 `navbar-with-logo` 自动定位，不依赖固定 chunk 号），并把只读权限规范化为 644。结束时打印各 mobile chunk 的实际哈希名 —— 记下，第 6 步要用。

### 5. 套用 DooTask 定制（幂等）

```bash
.claude/skills/add-version/apply-customizations.sh office/9.4.0
```
套用上面「定制清单」5 类。脚本对每类都做了幂等判断和「未命中预警」：
- default.json 若某条旧值找不到、新值也不在 → 说明该版官方默认值变了，会打 ⚠️ 让你人工核对。
- require.js 若找不到 `var requirejs,require,define;` 标记 → 报错退出（结构变化，需人工排查）。

### 6. 更新 docker-compose.yml（每版必改两处）

```bash
cp office/9.2.0/docker-compose.yml office/9.4.0/docker-compose.yml
```

**(a) 镜像 tag**：`onlyoffice/documentserver:9.2.0.1` → `:9.4.0.1`。

**(b) 三个 mobile css 挂载**：把旧哈希名换成第 4 步打印的新哈希名（**左右两侧路径都要换**）。当前新哈希名：
```bash
ls -1 office/9.4.0/resources/*/mobile/css/
```
其余挂载（`require.js`、三个 main `app.css`、`default.json`、`header/`）是固定路径，**不用动**。

挂载清单（核对用）：固定不变的 = `default.json`、`require.js`、`header/`、三个 main `app.css`；**仅三行随版本改名** = 三个 mobile `<hash>.css`。

### 7. 自检

```bash
D=office/9.4.0
grep -q _toolbarClick $D/resources/require.js && echo "require.js OK"
grep -rl "left-btn-about{display:none}" $D/resources/*/main/resources/css/app.css | wc -l   # 应为 3
grep -rl "navbar-with-logo{height:0px}" $D/resources/*/mobile/css/ | wc -l                  # 应为 3
grep -c '"500MB"\|"3000MB"\|1048576000' $D/etc/documentserver/default.json                   # 应 >=5
wc -c $D/resources/common/main/resources/img/header/{header,dark}-logo_s.svg                 # 应为 ~82-83B（空白）
# docker-compose 左侧文件是否都存在
grep -oE '\./[^:]+' $D/docker-compose.yml | while read p; do [ -e "$D/$p" ] && echo "OK $p" || echo "MISS $p"; done
```

**强烈建议实跑验证**（大版本升级时，定制可能因结构变化而"套上了但不生效"）：用新 docker-compose 起插件，浏览器打开编辑器确认：logo 已隐藏、工具栏出现「链接/历史」按钮、移动端 navbar 收起、能上传/打开较大文件。

### 8. 补充 CHANGELOG

新增 `office/9.4.0/CHANGELOG.md` 和 `CHANGELOG_zh.md`（AppStore 更新说明）——写法见 release-plugin 技能。典型："Updated/更新：升级 OnlyOffice 文档服务器至 9.4.0"。

### 9. 清理

```bash
docker rm -f oo-extract
```

完成后即可用 release-plugin 技能发布。

## 常见坑

- **default.json 不是原样复制**：它把 FileConverter 体积上限调大了 10 倍，必须套 patch（apply 脚本已处理）。直接用原版会导致大文件打不开/转换失败。
- **docker cp 出来是只读(444)**：copy-resources.sh 已统一 chmod 644，否则 apply 追加 CSS 会 Permission denied。
- **mobile chunk 一号多变体（9.4.0 起）**：新版同一 chunk 号（如 526）会有多个 hash 变体，只有 `dist/js/app.js` 的 `miniCssF` 指向的那个才真正被加载。copy-resources.sh 已先按 miniCssF 取 hash、再用 `navbar-with-logo` 二次确认；旧版（9.2.0）只有一个变体也兼容。若脚本仍报多候选且取不到 miniCssF，按提示进容器人工确认。
- **require.js 不再压缩（9.4.0 起）**：RequireJS 升到 2.3.8 且是未压缩源码，主体标记带空格 `var requirejs, require, define;`（9.2.0 压缩版无空格）。apply 用正则 `var requirejs, *require, *define;` 兼容两者；注入块本身与 requirejs 版本无关，插在该标记前即可。
- **忘了换 mobile 哈希名**：docker-compose 左侧文件不存在 → 挂载成空目录/容器报错；第 7 步自检的 MISS 能抓到。
- **用了 9.4 / latest 拉镜像**：哈希不可复现。务必 4 段具体号。
- **三段 CSS 一致是基于历史版本的假设**：若新版某编辑器结构大改导致不再一致，apply 仍会无脑追加同一段——自检只验证"有没有追加上"，不验证"是否适配新结构"，所以务必肉眼实跑复核一次。

## patches/ 文件说明

| 文件 | 内容 |
|------|------|
| `require-head.js` | require.js 注入块（3256B，从 9.2.0 实测提取，插在 license 与主体之间可字节还原） |
| `main-append.css` | 三个 main app.css 共用的追加块 |
| `mobile-append.css` | 三个 mobile css 共用的追加块 |
| `default-json-edits.tsv` | default.json 字面替换规则（`旧值<TAB>新值`，逐行） |
| `blank-header-logo_s.svg` / `blank-dark-logo_s.svg` | 空白 logo |
