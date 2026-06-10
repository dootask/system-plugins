"""
ai-kb 子包：DooTask AI 知识库的检索与入库能力。

模块：
- embeddings  OpenAI 兼容 embedding API 客户端（默认 ai.dootask.com / bge-m3）
- splitter    Markdown 感知切块
- index       主 redis vectorset 存取层（VADD/VSIM，Redis 8+）
- ingest      markdown → 向量入库（ingest_paths / ingest_all）
- retriever   VSIM 检索 + title-boost rerank（供 SearchHelpDocsTool 调用）
- lint        frontmatter / 长度 / 跨引用 校验
- eval        golden suite 回归

内容源：主仓库 dootask/resources/ai-kb/，通过 volume 只读挂载到 /app/kb-content。
"""
