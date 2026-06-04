---
name: drawio-add-version
description: 为 DooTask drawio 插件新增一个 drawio 版本目录：pull 指定版官方镜像→提取原始 webapp 文件→套用 DooTask 定制（注入 EXPORT_URL/iconsearch、裁剪菜单、放开嵌入限制等）→拷贝静态资源→生成版本目录与 docker-compose 挂载。用户要「升级/适配 drawio 新版本」「加一个 30.x 版本」时使用。
---

# 新增 drawio 版本

DooTask 的 drawio 插件**不自建 webapp 镜像**，而是直接用官方 `jgraph/drawio` 镜像，再通过 volume
挂载把几个 DooTask 定制文件覆盖进去。每个 drawio 版本一个目录（如 `drawio/30.0.4/`）。因为
`index.html`/`app.min.js`/`ElectronApp.js` 是**每版都会变的官方文件**，新版必须重新从镜像提取并重新套定制。

本技能把整套流程脚本化。**定制内容是用「干净镜像 vs 现有插件目录」逐文件 diff 实测固化的**，存在
`patches.json` 里（紧锚点子串 + 多版本候选 + 幂等 done 标记），已验证能**字节级复现 24.7.17**、
且能正确套到 **30.0.4**（自动处理 minified 变量名变化、geBootstrap 外置等结构差异）。

## 定制清单（apply.py 自动套用）

| 文件 | 来源 | 定制 |
|------|------|------|
| `webapp/index.html` | 镜像提取 | ① `<script id="geBootstrap">` 后注入 `EXPORT_URL`/`DRAWIO_LIGHTBOX_URL`/`ICONSEARCH_PATH`（指向 `/drawio/*`）② `.geBlock` 规则加 `display:none`（隐藏空画布提示块） |
| `webapp/js/diagramly/ElectronApp.js` | 镜像提取 | ① 注释掉 CSP `<meta>` 重设代码块（放开嵌入）② File 菜单只留 `import`，去掉 new/open/save/close/exit 等 |
| `webapp/js/app.min.js` | 镜像提取 | 5 处小补丁：禁用 `addBeforeUnloadListener`、菜单去 `help`、放开 iconsearch 与 insertTemplate 的 `isOffline` 限制、`EmbedFile` 支持 url `title` 参数 |
| `webapp/js/croppie/croppie.min.css` | 上一版拷贝 | DooTask 新增的静态库 CSS（镜像里没有），与版本无关 |
| `webapp/stencils/` | 上一版拷贝 | 只保留 `clipart/` 子集（静态）。注意：挂载它会遮蔽官方完整图形库——这是既有行为，保持不变 |

> apply.py 对每处先判断是否已套用（幂等），未命中会 ⚠️ 告警。
> **大版本升级时，官方前端结构可能变化导致锚点未命中或「套上了但不生效」，务必看告警 + 浏览器实跑复核。**

## 前置

- 本机可用 Docker；`python3`（apply 用它做字面替换）。
- 镜像 tag 用官方 3 段版本号（如 `30.0.4`），目录名同样用它（= AppStore 版本号）。

## 步骤

设：`VER=30.0.4`（新版本，目录名=镜像tag），`PREV=drawio/24.7.17`（上一版本目录）。命令在仓库根目录执行。

### 1. 提取原始文件 + 拷贝静态资源

```bash
.claude/skills/drawio-add-version/copy-resources.sh 30.0.4 drawio/30.0.4 drawio/24.7.17
```
脚本会：pull `jgraph/drawio:30.0.4` → 起临时容器 cp 出 `index.html`、`js/app.min.js`、
`js/diagramly/ElectronApp.js` → 从上一版拷 `js/croppie`、`stencils` → 权限统一 644。

### 2. 套用 DooTask 定制（幂等）

```bash
python3 .claude/skills/drawio-add-version/apply.py drawio/30.0.4
```
看输出：理想是「无未命中」。**有 ⚠️ 未命中 = 该新版结构变了**，需人工对照 `patches.json` 里该 change 的
`old`/`new` 在新版文件里找等价位置，给它**补一个该版本的 variant**（编辑 `build_patches.py` 后重跑生成）。

### 3. 写 docker-compose.yml（每版必改）

```bash
cp drawio/24.7.17/docker-compose.yml drawio/30.0.4/docker-compose.yml
cp drawio/24.7.17/nginx.conf         drawio/30.0.4/nginx.conf
```
然后改 `drawio/30.0.4/docker-compose.yml`：
- `drawio-webapp` 的 `image:` → `jgraph/drawio:30.0.4`。
- `drawio-export` 的 `image:` → `dootask/export-server:latest`（替代旧 `kuaifan/export-server`；
  该镜像由 `github.com/dootask/draw-image-export2` 每日多架构构建）。
- **核对挂载左侧文件都存在**（新版若改了 croppie 路径等需同步）：
  ```bash
  D=drawio/30.0.4
  grep -oE '\./[^:]+' $D/docker-compose.yml | while read p; do [ -e "$D/$p" ] && echo "OK $p" || echo "MISS $p"; done
  ```

### 4. 自检（可选：与上一版对比定制是否都在）

```bash
D=drawio/30.0.4/webapp
grep -q 'window.EXPORT_URL = window.location.origin + "/drawio/export/"' $D/index.html && echo "index OK"
grep -q "addMenuItems(menu, \['import'\], parent)" $D/js/diagramly/ElectronApp.js && echo "menu OK"
```

### 5. 补 CHANGELOG

新增 `drawio/30.0.4/CHANGELOG.md` 和 `CHANGELOG_zh.md`（AppStore 更新说明）——写法见 `release-plugin` 技能。
典型："Updated/更新：升级 drawio 至 30.0.4"。

### 6. 实跑验证（强烈建议，尤其大版本）

用新 docker-compose 起插件，浏览器打开确认：画布正常加载、定制菜单/按钮符合预期、
PNG 客户端导出正常、**PDF 经 `dootask/export-server` 导出正常**。

完成后用 `release-plugin` 技能发布（推 `drawio/30.0.4` tag）。

## 自验证（修改本技能后回归）

```bash
SK=.claude/skills/drawio-add-version
$SK/copy-resources.sh 24.7.17 /tmp/v drawio/24.7.17
python3 $SK/apply.py /tmp/v
for f in index.html js/app.min.js js/diagramly/ElectronApp.js; do
  cmp /tmp/v/webapp/$f drawio/24.7.17/webapp/$f && echo "OK $f"
done
```
应三个文件全部 identical（字节级复现 24.7.17）。

## 文件说明

| 文件 | 作用 |
|------|------|
| `copy-resources.sh` | 从镜像提取动态文件 + 从上一版拷静态资源 |
| `apply.py` | 读 `patches.json` 套定制（幂等 + 多版本候选 + 未命中告警） |
| `patches.json` | 所有定制的 `{old,new}` 字面替换（紧锚点 + 多版本 variant + done 标记） |
| `build_patches.py` | 作者侧工具：从真实文件精确切片重新生成 `patches.json`（结构大改、加新版本 variant 时用）。依赖 `/tmp/dx-orig`(24原始)、`/tmp/dx-orig30`(30原始) |

## 常见坑

- **app.min.js / ElectronApp.js 锚点未命中**：新版官方改了对应代码。看 apply.py 的 ⚠️，对照 patch 的
  `old` 在新文件里找等价位置手改，再 `gen-patches.py` 重新固化。
- **croppie/stencils 是静态**：从上一版拷即可，不要试图从镜像取（镜像里没有 croppie；stencils 是精选子集）。
- **export-server 不能删**：webapp 的 `EXPORT_URL` 指向它做服务端 PDF 导出。新版用 `dootask/export-server`。
- **目录名 = AppStore 版本号 = 镜像 tag**，三者一致用官方 3 段号。
