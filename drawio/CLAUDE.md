# drawio 插件

纯打包：官方 `jgraph/drawio` + 导出服务 `kuaifan/export-server`，两个镜像都不在本仓库构建。

- `webapp/` 下的文件（index.html、app.min.js 等）通过 `docker-compose.yml` 挂载覆盖官方镜像内对应文件——改 drawio 前端定制就改这里。
- **export-server 不能删**：webapp 的 `EXPORT_URL` 指向它（`/drawio/export/`），去掉会导致导出 PNG/PDF 失效。
