"""
Ingest: 主仓库 ai-kb markdown → 主 redis vectorset + 正文 HASH

入口：
- ingest_one(rel_path)   单文件
- ingest_paths(paths)    批量增量（POST /kb/reindex 用）
- ingest_all()           全量（首次入库 / 模型漂移重建）
- reconcile()            按文件 hash 对账增量收敛（容器启动期调用，
                         客户实例没有外部触发通道，靠它吸收 DooTask 更新带来的内容增删改）

CLI：python -m helper.kb.ingest [--path X] [--reconcile] [--dry-run] [--locale zh]
"""

import asyncio
import glob as _glob
import hashlib
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

import frontmatter
from redis.commands.vectorset.commands import QuantizationOptions
from redis.exceptions import ResponseError

from .embeddings import get_embedder, model_name, to_fp32
from .index import KEY_PREFIX, META_KEY, VSET_KEY, get_raw_client, get_vset, write_index_meta
from .splitter import split_markdown

logger = logging.getLogger("ai.kb.ingest")

REQUIRED_FM = ("id", "title", "type", "feature", "scope", "locale")


def _kb_root() -> str:
    return os.environ.get("KB_CONTENT_DIR", "/app/kb-content")


def _build_embed_text(title: str, aliases: List[str], content: str) -> str:
    """拼 title + aliases 到 embed 文本前。

    HASH 里 text 字段仍是原始 chunk content（给 LLM 阅读），不被这里影响。
    把别名编进向量是为了提升召回——用户问"走流程"也能命中标题"审批中心"
    （aliases: ["走流程","报销审批"]）。

    格式刻意冗余但简短：title 单独一行（H1 信号强），aliases 用、连接
    （bge-m3 对短关键词列表敏感），最后跟正文。
    """
    parts: List[str] = []
    t = (title or "").strip()
    if t:
        parts.append(t)
    al = [str(a).strip() for a in (aliases or []) if str(a).strip()]
    if al:
        parts.append("关键词：" + "、".join(al))
    parts.append(content or "")
    return "\n".join(parts)


def _list_md_files(root: str, locale: str = "zh") -> List[str]:
    """列出指定 locale 下所有 markdown 文件相对路径。"""
    pattern = os.path.join(root, locale, "**", "*.md")
    return sorted(
        os.path.relpath(p, root)
        for p in _glob.glob(pattern, recursive=True)
    )


def _file_hash(raw: bytes) -> str:
    return hashlib.sha1(raw).hexdigest()[:16]


async def _vrem_quiet(elem: str) -> None:
    try:
        await get_vset().vrem(VSET_KEY, elem)
    except ResponseError:
        pass


async def _delete_old_chunks(chunk_id: str) -> int:
    """删除某 chunk 历史所有切片（vectorset element + 正文 HASH），返回删除数。

    记账式：meta 的 src:{chunk_id} 字段记录上次写入的 chunk 数，按数遍历删除。
    主 redis 与 Laravel 共用 keyspace，禁止全库 SCAN——仅在记账缺失且 meta
    已存在（说明经历过 ingest，可能有未记账残留）时做一次兜底 SCAN 自愈。
    """
    r = get_raw_client()
    raw = await r.hget(META_KEY, f"src:{chunk_id}")
    if raw is not None:
        try:
            n = int(raw)
        except (ValueError, TypeError):
            n = 0
        if n:
            for i in range(n):
                await _vrem_quiet(f"{chunk_id}#{i}")
            pipe = r.pipeline(transaction=False)
            for i in range(n):
                pipe.delete(f"{KEY_PREFIX}{chunk_id}#{i}".encode())
            await pipe.execute()
        await r.hdel(META_KEY, f"src:{chunk_id}")
        return n

    # 记账缺失：全新文件（最常见，直接返回）或上次写入中断未记账
    if not await r.exists(META_KEY):
        return 0
    pattern = f"{KEY_PREFIX}{chunk_id}#*".encode()
    cursor = 0
    stale: List[bytes] = []
    while True:
        cursor, keys = await r.scan(cursor=cursor, match=pattern, count=500)
        stale.extend(keys)
        if cursor == 0:
            break
    if stale:
        logger.warning(f"no bookkeeping for {chunk_id}; cleaned {len(stale)} stale keys via scan")
        for k in stale:
            await _vrem_quiet(k.decode()[len(KEY_PREFIX):])
        await r.delete(*stale)
    return len(stale)


async def _write_bookkeeping(rel_path: str, chunk_id: str, count: int, file_hash: str) -> None:
    """meta 双账：src:{id} 记 chunk 数（删除用），path:{rel_path} 记 hash+id（对账用）。"""
    await get_raw_client().hset(META_KEY, mapping={
        f"src:{chunk_id}".encode(): str(count).encode(),
        f"path:{rel_path}".encode(): f"{file_hash}:{chunk_id}".encode(),
    })


async def ingest_one(rel_path: str, kb_root: Optional[str] = None) -> Dict[str, Any]:
    """ingest 单个 markdown 文件。"""
    root = kb_root or _kb_root()
    full = os.path.join(root, rel_path)

    if not os.path.isfile(full):
        return {"path": rel_path, "ok": False, "error": "file not found"}

    try:
        with open(full, "rb") as f:
            raw = f.read()
        post = frontmatter.loads(raw.decode("utf-8"))
    except Exception as e:
        return {"path": rel_path, "ok": False, "error": f"frontmatter parse: {e}"}

    fm = post.metadata
    body = post.content
    file_hash = _file_hash(raw)

    missing = [k for k in REQUIRED_FM if not fm.get(k)]
    if missing:
        return {"path": rel_path, "ok": False, "error": f"missing fields: {missing}"}

    chunks = split_markdown(body)
    if not chunks:
        await _delete_old_chunks(fm["id"])
        await _write_bookkeeping(rel_path, str(fm["id"]), 0, file_hash)
        return {"path": rel_path, "id": fm["id"], "chunks": 0, "ok": True, "error": None}

    title = str(fm.get("title") or "")
    aliases_raw = fm.get("aliases") or []
    if isinstance(aliases_raw, str):
        aliases = [aliases_raw]
    else:
        aliases = list(aliases_raw)

    embed_texts = [_build_embed_text(title, aliases, c["content"]) for c in chunks]
    vecs = await get_embedder().encode(embed_texts)

    await _delete_old_chunks(fm["id"])

    r = get_raw_client()
    vs = get_vset()

    # 写序：先 HSET 正文再 VADD 向量——保证 VSIM 命中的 element 必有正文可取
    pipe = r.pipeline(transaction=False)
    for i, chunk in enumerate(chunks):
        key = f"{KEY_PREFIX}{fm['id']}#{i}".encode()
        pipe.hset(key, mapping={
            b"locale": str(fm["locale"]).encode(),
            b"source": str(fm["id"]).encode(),
            b"feature": str(fm["feature"]).encode(),
            b"type": str(fm["type"]).encode(),
            b"scope": str(fm["scope"]).encode(),
            b"title": str(fm["title"]).encode(),
            b"text": chunk["content"].encode(),
        })
    await pipe.execute()

    # 无 attributes 的 element 永远不匹配任何 FILTER（vectorset 语义）——必须带
    attrs = {
        "locale": str(fm["locale"]),
        "scope": str(fm["scope"]),
        "source": str(fm["id"]),
        "feature": str(fm["feature"]),
    }
    for i, vec in enumerate(vecs):
        await vs.vadd(
            VSET_KEY,
            to_fp32(vec),
            f"{fm['id']}#{i}",
            quantization=QuantizationOptions.NOQUANT,
            attributes=attrs,
        )

    await _write_bookkeeping(rel_path, str(fm["id"]), len(chunks), file_hash)

    return {"path": rel_path, "id": fm["id"], "chunks": len(chunks), "ok": True, "error": None}


async def ingest_paths(paths: List[str], kb_root: Optional[str] = None) -> Dict[str, Any]:
    """批量 ingest。失败的不阻塞其他文件。"""
    results: List[Dict[str, Any]] = []
    total = len(paths)
    progress_every = 50
    for idx, p in enumerate(paths, 1):
        try:
            results.append(await ingest_one(p, kb_root))
        except Exception as e:
            logger.exception(f"ingest failed for {p}")
            results.append({"path": p, "ok": False, "error": str(e)})
        if idx % progress_every == 0 or idx == total:
            logger.info(f"ingest progress: {idx}/{total} files")

    ok = sum(1 for r in results if r.get("ok"))
    failed = [r for r in results if not r.get("ok")]
    total_chunks = sum(r.get("chunks", 0) for r in results if r.get("ok"))

    # 末尾写 meta：全量中断重启时 meta.model 缺失会被 ensure_vset 判为漂移 → 触发重建
    if ok:
        try:
            await write_index_meta(model_name(), get_embedder().dim)
        except Exception as e:
            logger.warning(f"write_index_meta failed: {e}")

    return {
        "ingested": ok,
        "failed": len(failed),
        "total_chunks": total_chunks,
        "errors": failed,
    }


async def ingest_all(
    kb_root: Optional[str] = None,
    locales: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """全量 ingest。"""
    root = kb_root or _kb_root()
    if not os.path.isdir(root):
        logger.warning(f"KB content dir not found: {root}; skipping ingest")
        return {"ingested": 0, "failed": 0, "total_chunks": 0, "errors": []}

    locales = locales or ["zh"]  # P0 只跑中文；P1 加 en
    all_paths: List[str] = []
    for loc in locales:
        all_paths.extend(_list_md_files(root, loc))

    logger.info(f"ingest_all: {len(all_paths)} files from {root}")
    if not all_paths:
        return {"ingested": 0, "failed": 0, "total_chunks": 0, "errors": []}

    return await ingest_paths(all_paths, kb_root=root)


async def reconcile(
    kb_root: Optional[str] = None,
    locales: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """按文件内容 hash 对账，增量收敛新增/变更/删除的 markdown。

    无变化时只做本地哈希比对，零 embedding API 调用、零写入。
    meta 缺 path:* 账（如从旧版本升级）时相关文件会被视为变更，触发一次性重灌补账。
    """
    root = kb_root or _kb_root()
    if not os.path.isdir(root):
        logger.warning(f"KB content dir not found: {root}; skip reconcile")
        return {"changed": 0, "removed": 0, "ingested": 0, "failed": 0, "total_chunks": 0, "errors": []}

    locales = locales or ["zh"]
    disk: Dict[str, str] = {}
    for loc in locales:
        for p in _list_md_files(root, loc):
            try:
                with open(os.path.join(root, p), "rb") as f:
                    disk[p] = _file_hash(f.read())
            except OSError:
                continue

    r = get_raw_client()
    indexed: Dict[str, Tuple[str, str]] = {}  # rel_path -> (hash, chunk_id)
    for k, v in (await r.hgetall(META_KEY) or {}).items():
        key = k.decode()
        if key.startswith("path:"):
            h, _, cid = v.decode().partition(":")
            indexed[key[5:]] = (h, cid)

    changed = [p for p in disk if disk[p] != indexed.get(p, ("",))[0]]
    removed = [p for p in indexed if p not in disk]

    # 先删后增：同 id 的文件移动路径时，避免删除旧路径误伤新写入的 chunk
    for p in removed:
        await _delete_old_chunks(indexed[p][1])
        await r.hdel(META_KEY, f"path:{p}")

    if not changed:
        return {"changed": 0, "removed": len(removed), "ingested": 0, "failed": 0, "total_chunks": 0, "errors": []}

    logger.info(f"reconcile: {len(changed)} changed, {len(removed)} removed")
    result = await ingest_paths(changed, kb_root=root)

    # 同一路径换了 chunk id：清掉旧 id 留下的孤儿
    for p in changed:
        prev_id = indexed.get(p, ("", ""))[1]
        if not prev_id:
            continue
        cur = await r.hget(META_KEY, f"path:{p}")
        cur_id = cur.decode().partition(":")[2] if cur else ""
        if cur_id and cur_id != prev_id:
            await _delete_old_chunks(prev_id)

    return {"changed": len(changed), "removed": len(removed), **result}


# CLI 入口（开发期 docker exec 调用）
async def _main():
    import argparse
    parser = argparse.ArgumentParser(description="ai-kb ingest CLI")
    parser.add_argument("--kb-root", default=None, help="KB 根目录（默认 KB_CONTENT_DIR）")
    parser.add_argument("--path", action="append", help="单文件相对路径，可重复；不给则全量")
    parser.add_argument("--locale", action="append", help="指定 locale，可重复；默认 zh")
    parser.add_argument("--reconcile", action="store_true", help="按 hash 对账增量收敛")
    parser.add_argument("--dry-run", action="store_true", help="只列出待 ingest 文件")
    args = parser.parse_args()

    root = args.kb_root or _kb_root()

    if args.dry_run:
        for loc in args.locale or ["zh"]:
            paths = _list_md_files(root, loc)
            print(f"[{loc}] {len(paths)} files")
            for p in paths:
                print(f"  {p}")
        return

    if args.reconcile:
        result = await reconcile(kb_root=root, locales=args.locale)
    elif args.path:
        result = await ingest_paths(args.path, kb_root=root)
    else:
        result = await ingest_all(kb_root=root, locales=args.locale)

    print(result)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_main())
