"""
Doo AI 网关（AppStore 计量代理）服务端 token 工具。

知识库向量化等服务端到服务端的调用，需要以「本安装实例」的身份走计量网关。
这里按 instance_id 自助 provision 一个匿名账号 token 并进程内缓存，
失效（401/403）时由调用方 force 重新获取。

注意：这是服务端用途，与前端面板里用户登录/认领得到的 token 相互独立。
"""

import asyncio
import logging
from typing import Optional

import httpx

from helper.config import DOOTASK_AI_GATEWAY_URL, DOOTASK_AI_INSTANCE_ID

logger = logging.getLogger("ai.gateway")

_token: Optional[str] = None
_lock = asyncio.Lock()


def gateway_configured() -> bool:
    return bool(DOOTASK_AI_GATEWAY_URL)


def gateway_base_url() -> str:
    """OpenAI 兼容根地址（计量代理），约定到 /v1。"""
    return (DOOTASK_AI_GATEWAY_URL + "/v1") if DOOTASK_AI_GATEWAY_URL else ""


async def get_server_token(force: bool = False) -> Optional[str]:
    """获取本实例的网关 token（进程内缓存）。失败返回 None，由调用方回退。"""
    global _token
    if not DOOTASK_AI_GATEWAY_URL:
        return None
    if _token and not force:
        return _token
    async with _lock:
        if _token and not force:
            return _token
        url = f"{DOOTASK_AI_GATEWAY_URL}/api/v1/ai/account/provision"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(url, json={"instance_id": DOOTASK_AI_INSTANCE_ID})
            data = resp.json() if resp.content else {}
            tk = ((data or {}).get("data") or {}).get("gateway_token")
            if resp.status_code < 300 and tk:
                _token = tk
                logger.info("gateway: provisioned server token for embedding")
                return _token
            logger.warning(
                "gateway: provision failed HTTP %s: %s",
                resp.status_code, (resp.text or "")[:200],
            )
        except httpx.HTTPError as exc:
            logger.warning("gateway: provision request error: %s", exc)
        return None
