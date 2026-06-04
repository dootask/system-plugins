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
- Vector search requires the AI Assistant plugin (for Embedding generation)
- Recommended: at least 2GB available memory
- Large files (>1MB) may take longer to extract content
- Lightweight compared to other search solutions

## Technical Specifications
- Vector Dimension: 1536 (compatible with OpenAI text-embedding-3-small)
- Storage Engine: Manticore Search 15.x
- Index Types: KNN vector index (HNSW) + inverted full-text index
- Chinese Tokenization: ICU Chinese morphology
