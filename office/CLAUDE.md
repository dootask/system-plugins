# office 插件

OnlyOffice：用官方镜像 `onlyoffice/documentserver` + 挂载定制资源，本仓库不构建镜像。

- **新增/升级 OnlyOffice 版本用 `office-add-version` 技能**，别手工拼版本目录。
- `<版本>/resources/`、`<版本>/etc/default.json` 是从官方容器提取后套定制的产物，**不要手改**；定制集合（require.js 注入 / CSS 追加 / default.json 体积上限 / 空白 logo）由技能的 patches 维护，可字节级复现。
- 版本目录名用 3 段（如 `9.4.0`）；`docker-compose.yml` 的镜像 tag 用官方 4 段（如 `9.4.0.1`）。两者不同步是正常的。
- 每版仅 3 个 mobile css 的哈希文件名随版本变，`docker-compose.yml` 挂载需相应更新（技能会处理）。
