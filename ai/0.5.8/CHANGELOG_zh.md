### 新增

- 新增内部向量化端点 `POST /embeddings`（OpenAI 兼容，APP_KEY 鉴权），供主程序 Manticore 智能搜索复用同一免费向量模型，实现语义搜索零配置。
- `/embeddings` 同时接受派生服务密钥 `sha256(APP_KEY + ":embeddings")`（供 Manticore Auto Embeddings 使用，避免主密钥进入搜索引擎元数据）；单条输入文本上限 30000 字符。

### 优化

- 移除安装表单中的「知识库重建令牌」字段：内部 `/kb/reindex` 改用主程序全局 APP_KEY 鉴权，安装更简洁、无需管理员填写。
