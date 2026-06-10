"""
主 redis vectorset 存取层（Redis 8 原生 VADD/VSIM）

数据布局（共享主程序 redis，全部收敛到 dootask_ai:kb: 命名空间）：
- {KEY_PREFIX}{chunk_id}#{i}   HASH，chunk 正文（title/text/source/feature/scope/type/locale，不存向量）
- {VSET_KEY}                   vectorset，element 名 = "{chunk_id}#{i}"，附 locale/scope 等过滤属性
- {META_KEY}                   HASH：model / dim / ingested_at
                               + src:{chunk_id} → chunk 数（记账式删除用）
                               + path:{rel_path} → "{hash}:{chunk_id}"（启动对账用）

主 redis 与 Laravel 共用 keyspace，删除一律走 meta 记账，禁止全库 SCAN。
client 强制 RESP2（protocol=2）：vectorset 响应走扁平数组解析路径最稳，
redis-py 转成 dict{element: score}，插入序即相似度降序。
"""

import logging
import os
import time
from typing import Dict, Optional

import redis.asyncio as redis
from redis.exceptions import ResponseError

logger = logging.getLogger("ai.kb.index")

KEY_PREFIX = "dootask_ai:kb:"
VSET_KEY = f"{KEY_PREFIX}vset"
META_KEY = f"{KEY_PREFIX}meta"


_raw_client: Optional[redis.Redis] = None


def _redis_password() -> Optional[str]:
    """主 .env 里 REDIS_PASSWORD=null 是字面量字符串，按无密码处理。"""
    password = os.environ.get("REDIS_PASSWORD", "").strip()
    if password.lower() in ("", "null", "none"):
        return None
    return password


def get_raw_client() -> redis.Redis:
    """获取不解码的 redis client（用于二进制 FP32 blob 读写）。"""
    global _raw_client
    if _raw_client is None:
        _raw_client = redis.Redis(
            host=os.environ.get("REDIS_HOST", "localhost"),
            port=int(os.environ.get("REDIS_PORT", 6379)),
            db=int(os.environ.get("REDIS_DB", 0)),
            password=_redis_password(),
            decode_responses=False,
            protocol=2,
        )
    return _raw_client


def get_vset():
    """redis-py 8 的 vectorset 命令组（vadd/vsim/vrem/vcard/vdim...）。"""
    return get_raw_client().vset()


async def supports_vectorset() -> bool:
    """探测主 redis 是否支持 vectorset（Redis 8+）。VCARD 对不存在的 key 返回 0 不报错。"""
    try:
        await get_vset().vcard(VSET_KEY)
        return True
    except ResponseError as e:
        if "unknown command" in str(e).lower():
            return False
        raise
    except AttributeError:  # redis-py < 8 没有 vset()
        return False


async def count_docs() -> int:
    """返回索引内向量数量（lifespan skip 判断 + follower 轮询用）。"""
    try:
        return int(await get_vset().vcard(VSET_KEY) or 0)
    except Exception as e:
        logger.warning(f"count_docs failed: {e}")
        return 0


async def get_meta() -> Dict[str, str]:
    raw = await get_raw_client().hgetall(META_KEY)
    return {k.decode(): v.decode() for k, v in (raw or {}).items()}


async def write_index_meta(model: str, dim: int) -> None:
    """ingest 完成后写入索引元信息（skip-if-indexed 与漂移检测的依据）。"""
    await get_raw_client().hset(META_KEY.encode(), mapping={
        b"model": model.encode(),
        b"dim": str(dim).encode(),
        b"ingested_at": str(int(time.time())).encode(),
    })


async def ensure_vset(dim: int, model: str) -> bool:
    """校验已有 vectorset 与当前 embedding 配置一致。

    Returns:
        True  = 可直接使用（索引为空，或 dim/model 都匹配）
        False = 漂移（维度不符 / 模型不符 / 有数据但 meta 缺失=上次 ingest 中断），
                调用方按 KB_REBUILD_ON_MODEL_CHANGE 决定重建或拒绝
    """
    vs = get_vset()
    existing = int(await vs.vcard(VSET_KEY) or 0)
    if existing == 0:
        return True

    try:
        actual_dim = int(await vs.vdim(VSET_KEY))
    except Exception:
        actual_dim = None
    if actual_dim is not None and actual_dim != dim:
        logger.warning(f"vectorset dim mismatch: index={actual_dim}, embedding={dim}")
        return False

    meta = await get_meta()
    indexed_model = meta.get("model", "")
    if not indexed_model:
        logger.warning("vectorset has data but meta.model missing (interrupted ingest?); treat as drift")
        return False
    if indexed_model != model:
        logger.warning(f"embedding model drift: index={indexed_model}, configured={model}")
        return False
    return True


async def drop_all() -> int:
    """删除整个知识库（vectorset + 全部正文 HASH + meta）。按 meta 记账遍历，不 SCAN。

    Returns:
        删除的 HASH key 数
    """
    r = get_raw_client()
    meta = await get_meta()
    deleted = 0
    pipe = r.pipeline(transaction=False)
    for k, v in meta.items():
        if not k.startswith("src:"):
            continue
        source = k[4:]
        try:
            n = int(v)
        except ValueError:
            continue
        for i in range(n):
            pipe.delete(f"{KEY_PREFIX}{source}#{i}".encode())
            deleted += 1
    pipe.delete(VSET_KEY.encode())
    pipe.delete(META_KEY.encode())
    await pipe.execute()
    logger.info(f"drop_all: removed vectorset + meta + {deleted} content hashes")
    return deleted
