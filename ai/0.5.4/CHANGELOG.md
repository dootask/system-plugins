### Changed
- Help knowledge base (RAG) embeddings now call an OpenAI-compatible API (defaults to the official DooTask service ai.dootask.com, works out of the box; set EMBEDDING_BASE_URL / EMBEDDING_API_KEY in the main .env to use your own service) instead of in-container local inference.
- Back to a single image (~550MB); the standard/full dual-image selector is removed and every install ships with help-docs retrieval.
- Vector storage moved to the main Redis native vectorset (requires Redis 8+); the redis-stack sidecar container is removed.

### Upgrade notes
- Requires main Redis >= 8.0 (run `docker compose pull redis && docker compose up -d redis` if your floating `redis:alpine` image is older; otherwise help retrieval is auto-disabled while chat keeps working).
- AI conversation context resets once after upgrading (cache moves from redis-stack back to the main Redis).
- The old redis-stack volume can be removed manually: `docker volume rm <project>_dootask-ai-redis-stack-data`.
- If CI triggers /kb/reindex, sync the KB_INGEST_TOKEN secret with the value configured during this upgrade.
