# 28.4.4

## Engine

- Upgraded Manticore Search to 28.4.4 with Auto Embeddings: the engine calls the AI Assistant's free embedding model automatically on write, enabling zero-config semantic search.
- Requires the AI Assistant (ai) plugin ≥ 0.5.8.

## New: Admin "Search Status" panel

- New admin-only menu under application management: engine health, vector service, per-type index coverage with refill progress, sync task lock states, and the failure queue at a glance.
- Operations: retry failures (all/single), clear stale sync locks, refill a single type, full rebuild (typed confirmation required).
- Search test bench: query the engine directly (full-text / semantic / hybrid) to debug "why is it not found".
- Alerting: a 5-minute health check pushes a red-dot badge to admins when failures pile up, locks get stuck, or services become unreachable.
- OpenAPI declared: query status and run safe operations via `doo app call search status` etc. from the AI assistant or CLI.
