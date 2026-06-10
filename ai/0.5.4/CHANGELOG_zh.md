### 变更
- 帮助知识库（RAG）的 embedding 改为调用 OpenAI 兼容 API（默认 DooTask 官方服务 ai.dootask.com，开箱即用；如需自有服务，在主程序 .env 设置 EMBEDDING_BASE_URL / EMBEDDING_API_KEY 覆盖），不再在容器内本地推理。
- 回归单一镜像（~550MB），移除标准版/完整版双镜像选择；所有安装默认具备帮助知识库检索能力。
- 向量存储迁移至主程序 Redis 的原生 vectorset（需 Redis 8+），移除 redis-stack 附属容器。

### 升级注意
- 要求主程序 Redis ≥ 8.0（`redis:alpine` 浮动镜像较旧时执行 `docker compose pull redis && docker compose up -d redis` 升级；不满足时帮助检索自动禁用，AI 聊天不受影响）。
- 升级后 AI 会话上下文会重置一次（缓存从 redis-stack 迁回主 Redis）。
- 旧的 redis-stack 数据卷可手动清理：`docker volume rm <项目前缀>_dootask-ai-redis-stack-data`。
- 若使用 CI 自动触发 /kb/reindex，请将 CI 中的 KB_INGEST_TOKEN secret 与本次安装配置的值同步。
