"""
检索：vectorset VSIM + title-boost rerank

供 SearchHelpDocsTool 调用。

分数语义：VSIM 返回相似度 s=(1+cos)/2，范围 0-1，越大越相关。
embedding API / redis 故障会抛异常——由 tools 层 catch 后向 LLM 报"检索失败"，
不能静默返回空（空会触发"文档没有相关内容"话术，是假阴性误导）。
"""

import logging
from typing import Any, Dict, List, Optional

from .embeddings import get_embedder, to_fp32
from .index import KEY_PREFIX, VSET_KEY, get_raw_client, get_vset

logger = logging.getLogger("ai.kb.retriever")

DEFAULT_TOP_K = 5
# 相似度空间的标题命中加分；等价于 cosine 距离空间的 -0.1（s = 1 - d/2）
TITLE_BOOST = 0.05


def _decode(v: Any) -> str:
    if isinstance(v, bytes):
        try:
            return v.decode("utf-8")
        except Exception:
            return ""
    return v if isinstance(v, str) else (str(v) if v is not None else "")


async def search(
    query: str,
    locale: str = "zh",
    top_k: int = DEFAULT_TOP_K,
    scope_filter: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """VSIM 检索 + title-boost rerank。

    Args:
        query: 用户查询
        locale: 语种过滤 (zh / en)
        top_k: 返回数量
        scope_filter: 可选 scope 过滤（如 ["end-user"]）

    Returns:
        list of {"id", "title", "text", "score", "feature", "scope"}，score 越大越相关

    Raises:
        embedding API / redis 不可用时抛异常（调用方负责呈现"检索失败"）
    """
    if not query or not query.strip():
        return []

    qvec = await get_embedder().encode_one(query.strip())

    filters = [f'.locale == "{locale}"']
    if scope_filter:
        scopes = ", ".join(f'"{s}"' for s in scope_filter)
        filters.append(f".scope in [{scopes}]")
    filter_expr = " and ".join(filters)

    # 拉宽给 source-level dedup 留余地（一个 markdown 文件常切多 chunk）。
    # FILTER-EF 默认 = COUNT*100，fetch_k=20 时探索预算 ≈ 全 corpus，等效精确过滤。
    fetch_k = max(top_k * 4, 20)

    res = await get_vset().vsim(
        VSET_KEY,
        to_fp32(qvec),
        with_scores=True,
        count=fetch_k,
        filter=filter_expr,
    )
    if not res:
        return []

    # RESP2 下 redis-py 解析为 dict{element(bytes): score(float)}，插入序即相似度降序
    elems: List[tuple] = []
    r = get_raw_client()
    pipe = r.pipeline(transaction=False)
    for elem, score in res.items():
        name = _decode(elem)
        elems.append((name, float(score)))
        pipe.hmget(
            f"{KEY_PREFIX}{name}".encode(),
            b"title", b"text", b"source", b"feature", b"scope",
        )
    rows = await pipe.execute()

    q_strip = query.strip()
    hits: List[Dict[str, Any]] = []
    for (name, score), row in zip(elems, rows):
        if not row or row[0] is None:
            # 正文缺失（写入半途的瞬态），跳过该 element
            continue
        title = _decode(row[0])
        if q_strip and q_strip in title:
            score = min(1.0, score + TITLE_BOOST)
        hits.append({
            "id": _decode(row[2]),
            "title": title,
            "text": _decode(row[1]),
            "score": score,
            "feature": _decode(row[3]),
            "scope": _decode(row[4]),
        })

    hits.sort(key=lambda h: h["score"], reverse=True)
    # source-level dedup：同一 markdown 多个 chunk 只保留分数最高（最相似）那条
    seen = set()
    deduped: List[Dict[str, Any]] = []
    for h in hits:
        if h["id"] in seen:
            continue
        seen.add(h["id"])
        deduped.append(h)
        if len(deduped) >= top_k:
            break
    return deduped


def format_hits(hits: List[Dict[str, Any]]) -> str:
    """把 hits 格式化成给 LLM 看的字符串。"""
    if not hits:
        return "（未找到相关帮助文档）"
    blocks = []
    for h in hits:
        blocks.append(
            f"## {h['title']}\n"
            f"_source: {h['id']} | feature: {h['feature']} | score: {h['score']:.3f}_\n\n"
            f"{h['text']}"
        )
    return "\n\n---\n\n".join(blocks)
