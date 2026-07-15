### Added

- New internal embedding endpoint `POST /embeddings` (OpenAI-compatible, APP_KEY auth), letting the main app's Manticore search reuse the same free embedding model — zero-config semantic search.
- `/embeddings` also accepts a derived service key `sha256(APP_KEY + ":embeddings")` (used by Manticore Auto Embeddings so the master APP_KEY never lands in the search engine's metadata); each input text is capped at 30,000 characters.

### Improved

- Removed the "KB reindex token" install field: the internal `/kb/reindex` now authenticates with the main app's global APP_KEY, so install is simpler and admins no longer need to fill it in.
