"""
Markdown 感知切块器

策略：
1. MarkdownHeaderTextSplitter 先按 H1/H2 切大段（保留标题元信息）
2. RecursiveCharacterTextSplitter 再按 512 字符 / 128 overlap 细切

为什么不用 token 级长度：tiktoken 中文分词差异大，字符长度更稳定，
512 字符约等于 BGE-M3 200-300 token，留余量给 frontmatter 注入字段。
"""

import logging
from typing import Any, Dict, List

logger = logging.getLogger("ai.kb.splitter")

CHUNK_SIZE = 512
CHUNK_OVERLAP = 128


def split_markdown(body: str) -> List[Dict[str, Any]]:
    """切分 markdown 正文（不含 frontmatter）为多个 chunk。

    Args:
        body: 已剥离 frontmatter 的正文文本

    Returns:
        list of {"content": str, "metadata": {"h1": "...", "h2": "..."}}
    """
    body = (body or "").strip()
    if not body:
        return []

    from langchain_text_splitters import (
        MarkdownHeaderTextSplitter,
        RecursiveCharacterTextSplitter,
    )

    headers = [("#", "h1"), ("##", "h2")]
    md_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers)
    header_docs = md_splitter.split_text(body)

    if not header_docs:
        # 没有标题就退化为整段
        return [{"content": body, "metadata": {}}]

    char_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
    )
    chunks = char_splitter.split_documents(header_docs)

    return [
        {"content": c.page_content, "metadata": dict(c.metadata)}
        for c in chunks
    ]
