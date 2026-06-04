# DooTask 系统插件集合（system-plugins）

DooTask **系统插件**的统一仓库。凡是没有单独维护仓库的系统插件都集中放在这里管理与发布；每个插件一个顶层目录，目录名即插件的 AppStore appid。

> 系统插件 = DooTask 应用商店里以系统应用（`is_system_app`）身份提供、非 `community_` 命名空间的插件。
> 全部系统插件已收录于本仓库。

## 收录的插件

| 目录 / appid | 类型 | 说明 |
|---|---|---|
| `office` | 资源挂载 | OnlyOffice 在线文档编辑（官方镜像 + 挂载定制资源；有专门的 office-add-version 技能） |
| `drawio` | 纯打包 | drawio 流程图 |
| `face` | 纯打包 | 人脸/签到 |
| `fileview` | 纯打包 | 文件预览 |
| `minder` | 纯打包 | 思维导图 |
| `mysql-expose-port` | 纯打包 | MySQL 端口暴露 |
| `search` | 纯打包 | Manticore 搜索 |
| `ai` | 构建镜像 | DooTask AI（Python 应用，构建 `kuaifan/dootask-ai`） |
| `approval` | 构建镜像 | 审批中心（Go + Vue3 应用，构建 `kuaifan/dooapprove`） |
| `okr` | 构建镜像 | OKR 目标管理（Go + Vue3 应用，构建 `kuaifan/doookr`；源码来自 [hitosea/dootask-okr](https://github.com/hitosea/dootask-okr)） |

- **纯打包 / 资源挂载**：发布时只打包目录，不构建镜像。
- **构建镜像**：插件目录含源码（在 `src/`）与 `.build.yml`，发布时先构建并推送 Docker 镜像，再打包发布。

## 目录约定

每个插件目录就是一个标准 DooTask 插件包：

```
<插件>/                          # 目录名 = appid，例如 office
├── config.yml                  # 应用元信息（名称/描述/tags）
├── logo.svg                    # 或 logo.png
├── README.md / README_zh.md    # AppStore 展示用说明
├── <版本>/                     # 每个版本一个目录，如 9.4.0、24.7.17、0.5.3
│   ├── config.yml              # 版本级配置/钩子（可选）
│   ├── docker-compose.yml      # 容器编排
│   ├── nginx.conf              # 反向代理（可选）
│   ├── ...                     # 该插件该版本所需的其他资源
│   └── CHANGELOG.md / CHANGELOG_zh.md   # AppStore 更新说明（可选）
│
│   # —— 仅「构建镜像」型插件（ai / approval）额外有 ——
├── .build.yml                  # 镜像名 / context / dockerfile（发布时据此构建并推送镜像）
└── src/                        # 应用源码（含 Dockerfile）；不打入 AppStore 包，只用于构建镜像
```

打包时只取 `config.yml`、`logo*`、`README*` 和指定的 `<版本>/`；`src/`、`.build.yml` 等不入 AppStore 包。

仓库根另有：

```
.github/workflows/release.yml   # 通用发布工作流（按 tag 发布任意插件，零硬编码）
.claude/skills/
├── office-add-version/               # 仅 office：从官方镜像提取并套用定制，生成新版本目录
└── release-plugin/             # 发布任意插件的某个版本
README.md                       # 本文件
```

## 发布

发布靠**推送 `<插件>/<版本>` 形式的 tag**，例如：

```bash
git tag office/9.4.0 && git push origin office/9.4.0
```

```bash
git tag ai/0.5.4 && git push origin ai/0.5.4        # 构建镜像型插件同理
```

`.github/workflows/release.yml` 是**通用且零硬编码**的：从 tag 解析出插件名与版本，校验目录存在后——

1. 若 `<插件>/.build.yml` 存在，先按其中的 image/context/dockerfile **构建并推送 Docker 镜像**（`image:<版本>` 和 `:latest`）；没有则跳过。
2. 打包 `<插件>/{config.yml,logo*,README*} + <插件>/<版本>/`，以系统应用方式（`is_system_app: true`、`appid` = 插件目录名）发布到 DooTask AppStore。

纯版本号 tag（无斜杠）不会触发。详见 `release-plugin` 技能。

## 维护

**单一来源、不在两处维护**：插件的一切（配置、资源、版本）都只在它自己的目录里；发布工作流完全通用，新增或维护插件**都不需要改工作流**。

- **新增插件**：在根目录建一个以 appid 命名的目录（按上面的约定），推 `<appid>/<版本>` tag 即可。需构建镜像就再加 `src/` 与 `.build.yml`。
- **维护已有插件**：只改对应插件目录，再推新 tag。
- **office 升级 OnlyOffice 版本**：用 `office-add-version` 技能（pull 指定版镜像 → 提取资源 → 套用定制 → 生成新版本目录），其定制片段以「干净容器 vs 现有版本逐文件 diff」实测固化，可字节级复现。
- **ai / approval 改代码**：改 `src/` 下源码，按新版本号新建 `<版本>/` 目录（更新其 CHANGELOG），推 `<插件>/<新版本>` tag —— 工作流会用该版本号构建镜像并发布。
- **发布**：用 `release-plugin` 技能。

### 所需 GitHub Secrets

| Secret | 用途 |
| --- | --- |
| `DOOTASK_USERNAME` / `DOOTASK_PASSWORD` | DooTask AppStore 账号密码（所有插件发布都需要） |
| `DOCKER_USERNAME` / `DOCKER_PASSWORD` | Docker Hub 账号密码（仅 `ai`、`approval` 等含 `.build.yml` 的插件构建镜像时需要） |

由管理员在仓库 Settings → Secrets 一次性配置。
