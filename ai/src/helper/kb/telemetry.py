"""
检索打点：fire-and-forget 回调主仓库入库，绝不阻塞工具返回。

数据落主仓库 ai_assistant_search_logs 表（POST /api/assistant/log/search，
用户 token 鉴权），用于分析"哪些问题检索不到/质量差"，反哺 ai-kb 内容迭代。
失败只 log 不重试：打点是分析数据可容忍丢失，重试会在主仓库故障时放大请求量。
"""

import asyncio
import logging

import httpx

logger = logging.getLogger("ai")

# 持强引用防止后台 task 被 GC（asyncio 官方建议）
_bg_tasks: set = set()


def fire_search_log(server_url: str, token: str, payload: dict) -> None:
    """同步入口：投递后台上报任务，自身永不抛异常。"""
    if not server_url or not token:
        logger.info("kb search log skipped (no server_url/token): %s", payload.get("query"))
        return
    try:
        task = asyncio.create_task(_report(server_url, token, payload))
        _bg_tasks.add(task)
        task.add_done_callback(_bg_tasks.discard)
    except Exception as e:  # pragma: no cover - create_task 仅在无事件循环时抛
        logger.warning("kb search log dispatch failed: %s", e)


async def _report(server_url: str, token: str, payload: dict) -> None:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
            resp = await client.post(
                f"{server_url.rstrip('/')}/api/assistant/log/search",
                headers={"token": token},
                json=payload,
            )
            if resp.status_code != 200:
                logger.warning("kb search log report http %s", resp.status_code)
    except Exception as e:
        logger.warning("kb search log report failed: %s", e)
