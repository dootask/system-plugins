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
import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

import frontmatter
import yaml
from redis.commands.vectorset.commands import QuantizationOptions
from redis.exceptions import ResponseError

from .embeddings import get_embedder, model_name, to_fp32
from .index import KEY_PREFIX, META_KEY, VSET_KEY, get_raw_client, get_vset, write_index_meta
from .splitter import split_markdown

logger = logging.getLogger("ai.kb.ingest")

REQUIRED_FM = ("id", "title", "type", "feature", "scope", "locale")


def _kb_root() -> str:
    return os.environ.get("KB_CONTENT_DIR", "/app/kb-content")


def _apps_root() -> Optional[str]:
    """已安装应用包根（APPS_DIR，默认 /app/apps，对应只读挂载 docker/appstore/apps）。

    结构为 <app-id>/<version>/...（应用包原样）。AI 不再依赖 AppStore 复制 overlay，
    而是据广播事件下发的"已安装应用清单"到这里逐应用自取 knowledge_base 目录。
    目录不存在（未挂载）时各处会自动跳过。
    """
    root = os.environ.get("APPS_DIR", "/app/apps").strip()
    return root or None


def _read_app_kb_field(config_path: str) -> Optional[str]:
    """读应用 config.yml 的 knowledge_base 字段，返回相对目录（去前导 ./）；无则 None。

    兼容标量写法（knowledge_base: ./ai-kb）与映射写法（knowledge_base: {directory: ./ai-kb}）。
    """
    try:
        with open(config_path, "rb") as f:
            cfg = yaml.safe_load(f) or {}
    except (OSError, yaml.YAMLError):
        return None
    if not isinstance(cfg, dict):
        return None
    kb = cfg.get("knowledge_base")
    if isinstance(kb, str):
        directory = kb
    elif isinstance(kb, dict):
        directory = kb.get("directory") or ""
    else:
        return None
    directory = str(directory).strip().lstrip("./").strip()
    return directory or None


def _resolve_app_kb_dir(apps_root: str, app_id: str, version: str) -> Optional[str]:
    """定位某已安装应用的 knowledge_base 物理目录（优先版本目录、回退应用根）。

    复刻 AppStore 旧 mergeConfigs 的版本覆盖优先级：版本目录 config.yml 声明的字段
    优先于应用根 config.yml；目录解析同样"版本目录优先、回退应用根"。
    """
    app_dir = os.path.join(apps_root, app_id)
    version_dir = os.path.join(app_dir, version) if version else ""

    # 字段值：版本目录优先
    kb_rel = None
    if version_dir:
        kb_rel = _read_app_kb_field(os.path.join(version_dir, "config.yml"))
    if not kb_rel:
        kb_rel = _read_app_kb_field(os.path.join(app_dir, "config.yml"))
    if not kb_rel:
        return None

    # 物理目录：版本目录优先、回退应用根
    candidates = []
    if version_dir:
        candidates.append(os.path.join(version_dir, kb_rel))
    candidates.append(os.path.join(app_dir, kb_rel))
    for p in candidates:
        if os.path.isdir(p):
            return p
    return None


def _path_key(root_type: str, rel_path: str) -> str:
    """对账记账键。core 保持 path:{rel}（向后兼容旧索引），apps 用 path:apps:{rel}。"""
    if root_type == "apps":
        return f"path:apps:{rel_path}"
    return f"path:{rel_path}"


def _parse_path_key(meta_key: str) -> Optional[Tuple[str, str]]:
    """解析记账键 -> (root_type, rel_path)；非 path: 键返回 None。

    兼容旧格式 path:{rel}（无 root_type 段）按 core 处理。
    """
    if not meta_key.startswith("path:"):
        return None
    rest = meta_key[5:]
    if rest.startswith("apps:"):
        return ("apps", rest[5:])
    return ("core", rest)


def _merge_result(into: Dict[str, Any], res: Dict[str, Any]) -> Dict[str, Any]:
    into["ingested"] += res.get("ingested", 0)
    into["failed"] += res.get("failed", 0)
    into["total_chunks"] += res.get("total_chunks", 0)
    into["errors"].extend(res.get("errors", []))
    return into


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


def _list_installed_app_kb_files(
    apps_root: str, installed: List[Dict[str, Any]], locale: str = "zh"
) -> List[Tuple[str, str]]:
    """对已安装应用清单逐个解析 knowledge_base 目录，列出 (logical_rel, abs_path)。

    logical_rel = "<app-id>/<locale>/..."（剥掉 version 与 kb 目录名），使记账键
    path:apps:<app-id>/zh/... 跨版本稳定、与历史索引完全一致：升级零 churn，且
    卸载某应用时其条目可被精确对账删除（清单里没有 → 不在 disk → removed）。
    """
    out: List[Tuple[str, str]] = []
    for item in installed or []:
        app_id = (item.get("id") or "").strip() if isinstance(item, dict) else ""
        version = (item.get("version") or "").strip() if isinstance(item, dict) else ""
        if not app_id:
            continue
        kb_dir = _resolve_app_kb_dir(apps_root, app_id, version)
        if not kb_dir:
            continue
        pattern = os.path.join(kb_dir, locale, "**", "*.md")
        for p in _glob.glob(pattern, recursive=True):
            rel_in_kb = os.path.relpath(p, kb_dir)  # 如 zh/concept/x.md
            logical_rel = f"{app_id}/{rel_in_kb}"
            out.append((logical_rel, p))
    return sorted(out)


async def _save_installed_apps(installed: List[Dict[str, Any]]) -> None:
    """把"上次收到的已安装应用清单"持久化到 META_KEY，供容器重启时自愈对账。"""
    try:
        await get_raw_client().hset(META_KEY, b"installed_apps", json.dumps(installed).encode())
    except Exception as e:
        logger.warning(f"save installed_apps failed: {e}")


async def _load_installed_apps() -> List[Dict[str, Any]]:
    """读回持久化的已安装应用清单；无/损坏返回空列表。"""
    try:
        raw = await get_raw_client().hget(META_KEY, b"installed_apps")
        if not raw:
            return []
        data = json.loads(raw.decode())
        return data if isinstance(data, list) else []
    except Exception:
        return []


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


async def _write_bookkeeping(rel_path: str, chunk_id: str, count: int, file_hash: str, root_type: str = "core") -> None:
    """meta 双账：src:{id} 记 chunk 数（删除用），path 键记 hash+id（对账用）。"""
    await get_raw_client().hset(META_KEY, mapping={
        f"src:{chunk_id}".encode(): str(count).encode(),
        _path_key(root_type, rel_path).encode(): f"{file_hash}:{chunk_id}".encode(),
    })


async def ingest_one(
    rel_path: str, kb_root: Optional[str] = None, root_type: str = "core", abs_path: Optional[str] = None
) -> Dict[str, Any]:
    """ingest 单个 markdown 文件。

    记账键始终用 rel_path（logical）；abs_path 给定时从该绝对路径读文件内容
    （apps 用：物理路径含 version/kb 目录，但 logical rel 不含，保证记账键跨版本稳定）。
    """
    full = abs_path if abs_path else os.path.join(kb_root or _kb_root(), rel_path)

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
        await _write_bookkeeping(rel_path, str(fm["id"]), 0, file_hash, root_type)
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

    await _write_bookkeeping(rel_path, str(fm["id"]), len(chunks), file_hash, root_type)

    return {"path": rel_path, "id": fm["id"], "chunks": len(chunks), "ok": True, "error": None}


async def ingest_paths(
    paths: List[str],
    kb_root: Optional[str] = None,
    root_type: str = "core",
    abs_paths: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """批量 ingest。失败的不阻塞其他文件。

    abs_paths（与 paths 等长、一一对应）给定时按绝对路径读文件，paths 仅作 logical rel 记账。
    """
    results: List[Dict[str, Any]] = []
    total = len(paths)
    progress_every = 50
    for idx, p in enumerate(paths, 1):
        ap = abs_paths[idx - 1] if abs_paths else None
        try:
            results.append(await ingest_one(p, kb_root, root_type, abs_path=ap))
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
    kb_apps_root: Optional[str] = None,
    locales: Optional[List[str]] = None,
    installed_apps: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """全量 ingest（核心根 + 已安装应用自带 KB）。

    installed_apps 来自广播事件下发的清单；为 None 时读回持久化清单（容器自起场景）。
    """
    core_root = kb_root or _kb_root()
    apps_root = kb_apps_root if kb_apps_root is not None else _apps_root()
    locales = locales or ["zh"]  # P0 只跑中文；P1 加 en

    installed = installed_apps if installed_apps is not None else await _load_installed_apps()

    merged: Dict[str, Any] = {"ingested": 0, "failed": 0, "total_chunks": 0, "errors": []}

    if os.path.isdir(core_root):
        core_paths: List[str] = []
        for loc in locales:
            core_paths.extend(_list_md_files(core_root, loc))
        logger.info(f"ingest_all core: {len(core_paths)} files from {core_root}")
        if core_paths:
            _merge_result(merged, await ingest_paths(core_paths, kb_root=core_root, root_type="core"))
    else:
        logger.warning(f"KB content dir not found: {core_root}; skipping core ingest")

    if apps_root and os.path.isdir(apps_root) and installed:
        pairs: List[Tuple[str, str]] = []
        for loc in locales:
            pairs.extend(_list_installed_app_kb_files(apps_root, installed, loc))
        logger.info(f"ingest_all apps: {len(pairs)} files from {len(installed)} installed apps")
        if pairs:
            _merge_result(merged, await ingest_paths(
                [lr for lr, _ in pairs], root_type="apps", abs_paths=[ap for _, ap in pairs]))

    if installed_apps is not None:
        await _save_installed_apps(installed_apps)

    return merged


async def reconcile(
    kb_root: Optional[str] = None,
    kb_apps_root: Optional[str] = None,
    locales: Optional[List[str]] = None,
    installed_apps: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """按文件内容 hash 对账，增量收敛核心根 + 已安装应用自带 KB 的增/删/改 markdown。

    无变化时只做本地哈希比对，零 embedding API 调用、零写入。
    meta 缺 path:* 账（如从旧版本升级）时相关文件会被视为变更，触发一次性重灌补账。
    core 与 apps 按 root_type 分别记账（path:{rel} vs path:apps:{rel}），相同相对路径
    不会互相误删。

    installed_apps 是 apps 根的真相源：
      - 不为 None（来自事件，含显式空列表）→ apps 根权威，扫描 + 允许删除清单外条目；
      - 为 None（容器自起）→ 读回持久化清单；持久化为空时视为"未知"，不扫 apps、不删，
        避免无清单时误删既有应用条目（下一个事件会补账）。
    """
    core_root = kb_root or _kb_root()
    apps_root = kb_apps_root if kb_apps_root is not None else _apps_root()
    locales = locales or ["zh"]

    if installed_apps is not None:
        installed, apps_known = installed_apps, True
    else:
        installed = await _load_installed_apps()
        apps_known = len(installed) > 0

    # 扫描磁盘：disk[(root_type, rel)] = hash；scanned 记录"本次确实扫了"的根，
    # 未扫到的根（目录缺失/未挂载/无权威清单）其 indexed 条目不参与 removed 判定，避免误删。
    disk: Dict[Tuple[str, str], str] = {}
    apps_abs: Dict[str, str] = {}  # logical_rel -> abs_path（apps 改动重灌时按绝对路径读）
    scanned: set = set()
    if os.path.isdir(core_root):
        scanned.add("core")
        for loc in locales:
            for rel in _list_md_files(core_root, loc):
                try:
                    with open(os.path.join(core_root, rel), "rb") as f:
                        disk[("core", rel)] = _file_hash(f.read())
                except OSError:
                    continue
    else:
        logger.warning(f"KB content dir not found: {core_root}; skip core reconcile")

    if apps_root and os.path.isdir(apps_root) and apps_known:
        scanned.add("apps")
        for loc in locales:
            for logical_rel, abs_path in _list_installed_app_kb_files(apps_root, installed, loc):
                try:
                    with open(abs_path, "rb") as f:
                        disk[("apps", logical_rel)] = _file_hash(f.read())
                    apps_abs[logical_rel] = abs_path
                except OSError:
                    continue

    r = get_raw_client()
    indexed: Dict[Tuple[str, str], Tuple[str, str]] = {}  # (root_type, rel) -> (hash, chunk_id)
    for k, v in (await r.hgetall(META_KEY) or {}).items():
        parsed = _parse_path_key(k.decode())
        if parsed is None:
            continue
        h, _, cid = v.decode().partition(":")
        indexed[parsed] = (h, cid)

    changed = [key for key in disk if disk[key] != indexed.get(key, ("",))[0]]
    removed = [key for key in indexed if key[0] in scanned and key not in disk]

    # 先删后增：同 id 的文件移动路径时，避免删除旧路径误伤新写入的 chunk
    for rt, rel in removed:
        await _delete_old_chunks(indexed[(rt, rel)][1])
        await r.hdel(META_KEY, _path_key(rt, rel))

    # 收到权威清单即落持久化（即便本次无内容变化，也要刷新已装集合，供下次自起对账）
    if installed_apps is not None:
        await _save_installed_apps(installed_apps)

    if not changed:
        return {"changed": 0, "removed": len(removed), "ingested": 0, "failed": 0, "total_chunks": 0, "errors": []}

    core_changed = [rel for rt, rel in changed if rt == "core"]
    apps_changed = [rel for rt, rel in changed if rt == "apps"]
    logger.info(f"reconcile: core changed={len(core_changed)} apps changed={len(apps_changed)} removed={len(removed)}")

    merged: Dict[str, Any] = {"ingested": 0, "failed": 0, "total_chunks": 0, "errors": []}
    if core_changed:
        _merge_result(merged, await ingest_paths(core_changed, kb_root=core_root, root_type="core"))
    if apps_changed:
        _merge_result(merged, await ingest_paths(
            apps_changed, root_type="apps", abs_paths=[apps_abs[rel] for rel in apps_changed]))

    # 同一路径换了 chunk id：清掉旧 id 留下的孤儿
    for rt, rel in changed:
        prev_id = indexed.get((rt, rel), ("", ""))[1]
        if not prev_id:
            continue
        cur = await r.hget(META_KEY, _path_key(rt, rel))
        cur_id = cur.decode().partition(":")[2] if cur else ""
        if cur_id and cur_id != prev_id:
            await _delete_old_chunks(prev_id)

    return {"changed": len(changed), "removed": len(removed), **merged}


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
