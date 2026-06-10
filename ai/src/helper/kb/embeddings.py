"""
Embedding 客户端（OpenAI 兼容 /v1/embeddings API）

服务地址/密钥内置默认值（DooTask 官方 ai.dootask.com），EMBEDDING_BASE_URL /
EMBEDDING_API_KEY 环境变量可覆盖（如内网 Ollama / vLLM / 硅基流动）；
彻底关闭 RAG 用 RAG_ENABLED=false。

所有方法是 async：同步网络调用会卡住 worker 事件循环上的全部并发聊天请求。
"""

import asyncio
import logging
import os
import struct
from typing import List, Optional

import httpx

logger = logging.getLogger("ai.kb.embeddings")

# 429/5xx/网络错误的指数退避间隔（秒）；其余 4xx 是配置错误，不重试
_RETRY_DELAYS = (1, 2, 4)

# DooTask 官方默认 embedding 服务（共享 key，服务端限流）
DEFAULT_BASE_URL = "https://ai.dootask.com/v1"
DEFAULT_API_KEY = "sk-BLc6gtTEYAbjBKzduDL5SAvxio5rY541XHv4vrVeU9Wp7ShO"


def _base_url() -> str:
    """约定填到 /v1，代码拼 /embeddings。"""
    url = os.environ.get("EMBEDDING_BASE_URL", "").strip()
    return (url or DEFAULT_BASE_URL).rstrip("/")


def _api_key() -> str:
    return os.environ.get("EMBEDDING_API_KEY", "").strip() or DEFAULT_API_KEY


def model_name() -> str:
    return os.environ.get("EMBEDDING_MODEL", "qwen3-embedding:0.6b").strip()


def to_fp32(vec: List[float]) -> bytes:
    """转 FP32 little-endian blob（与 numpy float32 tobytes 字节序一致），供 VADD/VSIM 用。"""
    return struct.pack(f"<{len(vec)}f", *vec)


class Embedder:
    _instance: Optional["Embedder"] = None
    _client: Optional[httpx.AsyncClient] = None
    _dim: Optional[int] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _ensure_client(self) -> httpx.AsyncClient:
        if Embedder._client is None:
            # 默认 30s：要覆盖 Ollama 卸载模型后的冷加载（实测 2-9s）
            timeout = float(os.environ.get("EMBEDDING_TIMEOUT", 30))
            headers = {}
            api_key = _api_key()
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            Embedder._client = httpx.AsyncClient(timeout=timeout, headers=headers)
        return Embedder._client

    @property
    def dim(self) -> int:
        if Embedder._dim is None:
            raise RuntimeError("Embedder dim unknown; call probe() first")
        return Embedder._dim

    async def _post_batch(self, texts: List[str]) -> List[List[float]]:
        url = f"{_base_url()}/embeddings"
        payload = {"model": model_name(), "input": texts}
        client = self._ensure_client()
        last_err: Optional[Exception] = None
        for attempt in range(len(_RETRY_DELAYS) + 1):
            try:
                resp = await client.post(url, json=payload)
                if resp.status_code == 429 or resp.status_code >= 500:
                    last_err = RuntimeError(
                        f"embedding API HTTP {resp.status_code}: {resp.text[:200]}"
                    )
                else:
                    resp.raise_for_status()
                    items = resp.json()["data"]
                    items.sort(key=lambda d: d.get("index", 0))
                    return [d["embedding"] for d in items]
            except (httpx.TimeoutException, httpx.TransportError) as e:
                last_err = e
            if attempt < len(_RETRY_DELAYS):
                await asyncio.sleep(_RETRY_DELAYS[attempt])
        raise RuntimeError(f"embedding API failed after {len(_RETRY_DELAYS) + 1} attempts: {last_err}")

    async def encode(self, texts: List[str]) -> List[List[float]]:
        """文本批量编码。返回 list of 向量（float list），与输入同序。失败抛异常。"""
        if not texts:
            return []
        batch = max(1, int(os.environ.get("EMBEDDING_BATCH_SIZE", 32)))
        out: List[List[float]] = []
        for i in range(0, len(texts), batch):
            out.extend(await self._post_batch(texts[i:i + batch]))
        if Embedder._dim is None and out:
            Embedder._dim = len(out[0])
        return out

    async def encode_one(self, text: str) -> List[float]:
        """单条文本编码。失败抛异常（tools 层 catch 后向 LLM 报"检索失败"）。"""
        return (await self.encode([text]))[0]


_embedder = Embedder()


def get_embedder() -> Embedder:
    return _embedder


async def probe() -> int:
    """lifespan 启动期调用：连通性校验 + 获取向量维度。失败抛异常（由调用方降级）。"""
    vec = await get_embedder().encode_one("warmup")
    Embedder._dim = len(vec)
    logger.info(f"Embedding API ready: base={_base_url()}, model={model_name()}, dim={len(vec)}")
    return len(vec)
