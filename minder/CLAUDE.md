# minder 插件

思维导图（Vue），镜像 `dootask/minder`，源码在 `src/`（来自 kuaifan/minder）。

- `src/Dockerfile` 已改为**多阶段**（node 内 `npm run build` 生成 dist → nginx）。上游原 Dockerfile 是直接 `COPY dist`，而 `dist/` 被 gitignore——**别改回单阶段**，否则 CI 构建会因缺 dist 失败。
