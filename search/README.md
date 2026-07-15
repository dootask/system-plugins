# Manticore Search Plugin

## Overview
Manticore Search is a high-performance open-source search engine, providing intelligent file content search capabilities for DooTask. It supports full-text search, KNN vector search, and hybrid search, allowing you to find files through semantic understanding.

## Key Features
- **Hybrid Search**: Supports both keyword matching and semantic similarity search
- **Vector Search**: Built-in KNN vector search with HNSW algorithm
- **Content Search**: Search file contents, not just filenames
- **High Performance**: Extremely fast search responses, low resource usage
- **MySQL Compatible**: Fully compatible with MySQL protocol
- **Chinese Support**: Built-in Chinese tokenization (ICU)

## Use Cases
- Need to search file contents (Word, Excel, PDF, text, etc.)
- Want to find files using natural language descriptions
- Need smarter search beyond simple keyword matching

## Search Types
| Type | Description | Example |
|------|-------------|---------|
| Keyword Search | Traditional full-text matching | Search "quarterly report" |
| Semantic Search | AI understands search intent | Search "financial analysis" finds "Q3 revenue report" |
| Hybrid Search | Combines both approaches | More accurate results |

## Notes
- After installation, wait for the system to complete file content indexing
- Semantic/vector search works **out of the box with zero config**: it uses the free DooTask AI embedding model provided by the AI Assistant plugin — no third-party Embedding key required (so the AI Assistant plugin must be installed first)
- With large volumes of data, the free embedding model may be rate-limited by the gateway; to self-host embeddings, ops can override via `EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` on the AI Assistant plugin
- Recommended: at least 2GB available memory
- Large files (>1MB) may take longer to extract content
- Lightweight compared to other search solutions

## Technical Specifications
- Vector Dimension: 1024 (DooTask AI free embedding model qwen3-embedding:0.6b / bge-m3)
- Storage Engine: Manticore Search 28.x
- Index Types: KNN vector index (HNSW) + inverted full-text index
- Chinese Tokenization: ICU Chinese morphology
