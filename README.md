# DooTask OnlyOffice 插件（office）

在 DooTask 中集成 [OnlyOffice Document Server](https://www.onlyoffice.com/)，用于在线编辑与协作 Word / Excel / PowerPoint 等文档。AppStore 应用 ID 为 `office`，以系统应用方式发布。

## 工作原理

本插件**不自建镜像**，而是直接使用官方 `onlyoffice/documentserver` 镜像，再用 docker-compose 的 volume 把少量定制资源**覆盖挂载**进容器，从而在不分叉上游的前提下完成与 DooTask 的适配。

```
浏览器 ── /office/... ──► DooTask nginx（主域名 + TLS）
                              │  (本插件 nginx.conf 把 /office/ 反代到 office 容器)
                              ▼
                    onlyoffice/documentserver:<版本>   （官方镜像，未分叉）
                              ▲
                              │  docker-compose 挂载下列定制文件覆盖容器内同名路径
                    dootask-plugin/<版本>/resources、etc
```

因此每个 OnlyOffice 版本对应 `dootask-plugin/` 下的一个版本目录，目录里是从该版官方镜像中提取、再套用定制后的资源。**版本目录名用 3 段语义化版本**（如 `9.4.0`，等于 AppStore 版本号），而 `docker-compose.yml` 里的镜像 tag 用官方 4 段号（如 `9.4.0.1`）。

## 定制内容

对每个版本，相对官方镜像只做这几类改动（详见 `.claude/skills/add-version` 的 patches 与脚本）：

1. **require.js** —— 注入一段 JS：与 DooTask 父窗口 postMessage 通信、在工具栏注入「链接 / 历史」按钮、支持禁用下载、清理主题缓存。
2. **三个编辑器的 main `app.css`** —— 隐藏 OnlyOffice logo、关于、加载 logo，禁用下载按钮。
3. **三个编辑器的 mobile chunk css** —— 隐藏带 logo 的 navbar、禁用下载（该文件名带每版变化的哈希）。
4. **default.json** —— 调高 FileConverter 的文件体积上限。
5. **header logo** —— 替换为空白 svg，去除 OnlyOffice 品牌。

## 仓库结构

```
.
├── dootask-plugin/                 # DooTask 插件包
│   ├── config.yml                  # 应用元信息（名称/描述/tags）
│   ├── logo.svg
│   ├── README.md / README_zh.md    # AppStore 展示用说明
│   └── <版本>/                     # 每个 OnlyOffice 版本一个目录，如 9.4.0
│       ├── config.yml              # 安装/升级钩子（chmod）
│       ├── docker-compose.yml      # 官方镜像 + 定制资源挂载
│       ├── nginx.conf              # /office/ 反向代理到 office 容器
│       ├── etc/documentserver/default.json
│       ├── resources/              # 定制后的 require.js / css / header logo
│       └── CHANGELOG.md / CHANGELOG_zh.md
├── .github/workflows/release.yml   # 推送 tag → 打包对应版本目录 → 发布到 AppStore
└── .claude/skills/                 # 项目级技能（维护这个仓库主要就靠它们）
    ├── add-version/                # 新增一个 OnlyOffice 版本（含脚本与 patches）
    └── release-plugin/             # 打 tag 发布到 AppStore
```

## 维护：新增 OnlyOffice 版本

升级到新的 OnlyOffice 版本时，使用 **`add-version` 技能**（`.claude/skills/add-version`）。它把整套流程脚本化、并已对实测做幂等与版本结构变化的兜底：

> pull 指定版官方镜像 → 起干净容器 → `copy-resources.sh` 提取原始资源 → `apply-customizations.sh` 套用上述 5 类定制 → 按新哈希更新 `docker-compose.yml` 挂载 → 自检。

定制片段以「干净容器与现有版本逐文件 diff」实测固化在 `add-version/patches/`，可字节级复现，无需凭记忆维护。

## 维护：发布

使用 **`release-plugin` 技能**，或直接推一个 **3 段、不带 `v`、且等于版本目录名**的 tag 触发发布：

```bash
git tag 9.4.0 && git push origin 9.4.0
```

`.github/workflows/release.yml` 会校验 `dootask-plugin/<tag>/` 存在，只打包该版本目录，并以系统应用方式发布到 DooTask AppStore（appid `office`）。本插件不构建 Docker 镜像，所以发布很轻。

### 所需 GitHub Secrets

| Secret | 用途 |
| --- | --- |
| `DOOTASK_USERNAME` | DooTask AppStore 账号 |
| `DOOTASK_PASSWORD` | DooTask AppStore 密码 |

由管理员在仓库 Settings → Secrets 一次性配置；无需 Docker 相关 secrets。
