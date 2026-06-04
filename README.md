# DooTask 系统插件集合（system-plugins）

DooTask **系统插件**的统一仓库。凡是没有单独维护仓库的系统插件都集中放在这里管理与发布；每个插件一个顶层目录，目录名即插件的 AppStore appid。

> 系统插件 = DooTask 应用商店里以系统应用（`is_system_app`）身份提供、非 `community_` 命名空间的插件。
> 已单独维护、**不在本仓库**的系统插件：`ai`（kuaifan/dootask-ai）、`approve`（dootask/approval）、`okr`（hitosea/dootask-okr）。

## 收录的插件

| 目录 / appid | 说明 |
|---|---|
| `office` | OnlyOffice 在线文档编辑（官方镜像 + 挂载定制资源；最复杂，有专门的 office-add-version 技能） |
| `drawio` | drawio 流程图 |
| `face` | 人脸相关 |
| `fileview` | 文件预览 |
| `minder` | 思维导图 |
| `mysql-expose-port` | MySQL 端口暴露 |
| `search` | 搜索 |

## 目录约定

每个插件目录就是一个标准 DooTask 插件包：

```
<插件>/                          # 目录名 = appid，例如 office
├── config.yml                  # 应用元信息（名称/描述/tags）
├── logo.svg                    # 或 logo.png
├── README.md / README_zh.md    # AppStore 展示用说明
└── <版本>/                     # 每个版本一个目录，如 9.4.0、24.7.17
    ├── config.yml              # 版本级配置/钩子（可选）
    ├── docker-compose.yml      # 容器编排
    ├── nginx.conf              # 反向代理（可选）
    ├── ...                     # 该插件该版本所需的其他资源
    └── CHANGELOG.md / CHANGELOG_zh.md   # AppStore 更新说明（可选）
```

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

`.github/workflows/release.yml` 是**通用且零硬编码**的：从 tag 解析出插件名与版本，校验目录存在后，打包 `<插件>/{config.yml,logo*,README*} + <插件>/<版本>/`，以系统应用方式（`is_system_app: true`、`appid` = 插件目录名）发布到 DooTask AppStore。纯版本号 tag（无斜杠）不会触发。

详见 `release-plugin` 技能。

## 维护

**单一来源、不在两处维护**：插件的一切（配置、资源、版本）都只在它自己的目录里；发布工作流完全通用，新增或维护插件**都不需要改工作流**。

- **新增插件**：在根目录建一个以 appid 命名的目录（按上面的约定），推 `<appid>/<版本>` tag 即可。
- **维护已有插件**：只改对应插件目录，再推新 tag。
- **office 升级 OnlyOffice 版本**：用 `office-add-version` 技能（pull 指定版镜像 → 提取资源 → 套用定制 → 生成新版本目录），其定制片段以「干净容器 vs 现有版本逐文件 diff」实测固化，可字节级复现。
- **发布**：用 `release-plugin` 技能。

### 所需 GitHub Secrets

| Secret | 用途 |
| --- | --- |
| `DOOTASK_USERNAME` | DooTask AppStore 账号 |
| `DOOTASK_PASSWORD` | DooTask AppStore 密码 |

由管理员在仓库 Settings → Secrets 一次性配置；本仓库插件不构建镜像，无需 Docker 相关 secrets。
