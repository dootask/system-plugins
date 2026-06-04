# DooTask 系统插件集合（system-plugins）

DooTask 全部**系统插件**的统一仓库。每个插件一个顶层目录，目录名即 AppStore appid。

## 插件

| 目录 / appid | 类型 | 说明 |
|---|---|---|
| `office` | 资源挂载 | OnlyOffice 在线文档编辑 |
| `drawio` | 纯打包 | drawio 流程图 |
| `fileview` | 纯打包 | 文件预览 |
| `mysql-expose-port` | 纯打包 | MySQL 端口暴露 |
| `search` | 纯打包 | Manticore 搜索 |
| `ai` | 构建镜像 | DooTask AI（Python，`dootask/ai`） |
| `approve` | 构建镜像 | 审批中心（Go+Vue3，`dootask/approve`） |
| `okr` | 构建镜像 | OKR 目标管理（Go+Vue3，`dootask/okr`） |
| `face` | 构建镜像 | 人脸签到（Go，`dootask/face`） |
| `minder` | 构建镜像 | 思维导图（Vue，`dootask/minder`） |

三种类型：

- **纯打包**：引用现成镜像（官方或他处构建），发版只打包目录。
- **资源挂载**：用官方镜像 + 挂载定制资源（仅 `office`）。
- **构建镜像**：含 `src/` 源码与 `.build.yml`，发版时自动构建并推送 `dootask/<appid>` 镜像。

> 各插件的具体说明见其目录下的 `README.md`（面向用户）与 `CLAUDE.md`（面向维护）。

## 发布

推 `<插件>/<版本>` 形式的 tag 触发自动发布（构建镜像 → 打包 → 发到 DooTask AppStore）：

```bash
git tag office/9.4.0 && git push origin office/9.4.0
```

完整流程见 `release-plugin` 技能；office 升级 OnlyOffice 版本见 `office-add-version` 技能。

## GitHub Secrets

| Secret | 用途 |
| --- | --- |
| `DOOTASK_USERNAME` / `DOOTASK_PASSWORD` | DooTask AppStore（所有插件发布都需要） |
| `DOCKER_USERNAME` / `DOCKER_PASSWORD` | Docker Hub（仅构建镜像型插件需要） |
