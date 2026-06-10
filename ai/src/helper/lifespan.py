# 标准库导入
import asyncio
import fcntl
import logging
import os

# 第三方库导入
import httpx
from fastapi import FastAPI
from fastapi.concurrency import asynccontextmanager

# 本地模块导入
from helper.redis import RedisManager
from helper.mcp import ensure_dootask_mcp_config
from helper.config import MCP_HEALTH_URL, MCP_CHECK_INTERVAL, VISION_CLEANUP_INTERVAL
from helper.vision import cleanup_old_images, ensure_default_vision_config

# 日志配置
logger = logging.getLogger("ai")
logging.getLogger("httpx").setLevel(logging.WARNING)

async def check_mcp_health(app: FastAPI) -> None:
    """检查 MCP 服务的健康状态并将结果写入 app.state.mcp。"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(MCP_HEALTH_URL, timeout=3)
            is_ok = response.json().get("status") == "ok"
            app.state.dootask_mcp = is_ok
            if is_ok:
                ensure_dootask_mcp_config(enabled=True)
    except Exception as exc:  # pragma: no cover - best effort external check
        app.state.dootask_mcp = False
        logger.error(f"❌ 检测 MCP 失败: {MCP_HEALTH_URL} - 错误: {exc}")


async def periodic_mcp_check(app: FastAPI, interval: int = MCP_CHECK_INTERVAL) -> None:
    """每隔 interval 秒轮询 MCP 健康状态。"""
    while True:
        await check_mcp_health(app)
        await asyncio.sleep(interval)


async def periodic_vision_cleanup(interval: int = VISION_CLEANUP_INTERVAL) -> None:
    """Periodically cleanup old vision images."""
    # Run once at startup
    cleanup_old_images()
    # Then run periodically
    while True:
        await asyncio.sleep(interval)
        cleanup_old_images()


_INGEST_LOCK_PATH = "/tmp/ai_kb_ingest.lock"


def _try_acquire_ingest_lock():
    """非阻塞抢 ingest 进程锁；多 worker 中只让一个跑 ingest_all。

    返回 fd（持有锁）或 None（被别的 worker 占了）。fd 在进程退出会自动释放。
    """
    try:
        fd = os.open(_INGEST_LOCK_PATH, os.O_WRONLY | os.O_CREAT, 0o644)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return fd
    except BlockingIOError:
        return None
    except OSError:
        return None


async def _wait_for_ingest_done(timeout_s: int = 900) -> int:
    """跟随 worker：轮询 count_docs() 直到主 worker 写完数据。"""
    from helper.kb.index import count_docs
    for _ in range(timeout_s):
        try:
            n = await count_docs()
            if n > 0:
                return n
        except Exception:
            pass
        await asyncio.sleep(1)
    return 0


async def _init_kb(app: FastAPI) -> None:
    """ai-kb / RAG 初始化：依次探测配置/能力/漂移，再视情况 ingest_all。

    降级链（任一不满足 → kb_loaded=False + 独立日志，AI 聊天不受影响）：
    RAG_ENABLED → 主 redis 支持 vectorset（Redis 8+）→ embedding API 连通
    （probe 取 dim）→ 索引与当前模型/维度一致（漂移默认自动重建）。

    多 worker 协同：索引可用时全部 worker 立即 ready，由抢到 file lock 的 worker
    做内容 hash 对账（reconcile，收敛 DooTask 更新带来的 markdown 增删改，
    无变化时零 API 调用）；空索引/漂移时 leader 全量重建，其他 worker 等数据出现。
    """
    if os.environ.get("RAG_ENABLED", "true").lower() not in ("true", "1", "yes"):
        app.state.kb_loaded = False
        logger.info("RAG_ENABLED=false; skip ai-kb init")
        return

    try:
        from helper.kb import embeddings as kb_embeddings
        from helper.kb.index import count_docs, drop_all, ensure_vset, supports_vectorset
        from helper.kb.ingest import ingest_all, reconcile

        if not await supports_vectorset():
            app.state.kb_loaded = False
            logger.warning(
                "main redis lacks vectorset support (requires Redis >= 8); ai-kb/RAG disabled. "
                "Upgrade with `docker compose pull redis && docker compose up -d redis`."
            )
            return

        dim = await kb_embeddings.probe()
        model = kb_embeddings.model_name()

        index_ok = await ensure_vset(dim, model)
        if not index_ok:
            rebuild = os.environ.get("KB_REBUILD_ON_MODEL_CHANGE", "true").lower() in ("true", "1", "yes")
            if not rebuild:
                app.state.kb_loaded = False
                logger.warning("embedding model/dim drift and KB_REBUILD_ON_MODEL_CHANGE=false; ai-kb disabled")
                return
            # drop_all 放到 leader 锁内执行：多 worker 同时检测到漂移时
            # 不能各自 drop，否则会互删对方正在重建的数据

        existing = await count_docs()
        kb_root = os.environ.get("KB_CONTENT_DIR", "/app/kb-content")

        if index_ok and existing > 0:
            # 索引可用：全部 worker 立即 ready；抢到锁的 worker 对账收敛内容差异
            app.state.kb_loaded = True
            if not os.path.isdir(kb_root):
                logger.warning(f"ai-kb content dir not found: {kb_root}; skip reconcile")
                return
            lock_fd = _try_acquire_ingest_lock()
            if lock_fd is None:
                logger.info(f"ai-kb ready (docs={existing}); reconcile held by another worker")
                return
            try:
                result = await reconcile(kb_root=kb_root)
                if result["changed"] or result["removed"]:
                    logger.info(
                        f"ai-kb reconcile: changed={result['changed']} removed={result['removed']} "
                        f"ingested={result['ingested']} failed={result['failed']}; docs={await count_docs()}"
                    )
                else:
                    logger.info(f"ai-kb ready (docs={existing}); content in sync")
            finally:
                try:
                    fcntl.flock(lock_fd, fcntl.LOCK_UN)
                    os.close(lock_fd)
                except OSError:
                    pass
            return

        if not os.path.isdir(kb_root):
            logger.warning(f"ai-kb content dir not found: {kb_root}; RAG queries will return empty")
            app.state.kb_loaded = True
            return

        lock_fd = _try_acquire_ingest_lock()
        if lock_fd is None:
            logger.info("ai-kb ingest held by another worker; waiting for completion...")
            n = await _wait_for_ingest_done()
            app.state.kb_loaded = True
            logger.info(f"ai-kb ready (followed leader); index docs={n}")
            return

        try:
            if not index_ok:
                logger.warning("embedding model/dim drift detected; dropping index for full rebuild (leader)")
                await drop_all()
            result = await ingest_all(kb_root=kb_root)
            logger.info(f"ai-kb ingest_all: {result['ingested']} files, {result['total_chunks']} chunks")
            app.state.kb_loaded = True
            n = await count_docs()
            logger.info(f"ai-kb ready; index docs={n}")
        finally:
            try:
                fcntl.flock(lock_fd, fcntl.LOCK_UN)
                os.close(lock_fd)
            except OSError:
                pass
    except Exception as exc:
        app.state.kb_loaded = False
        logger.exception(f"ai-kb init failed: {exc}")


@asynccontextmanager
async def lifespan_context(app: FastAPI):
    """FastAPI 生命周期钩子，负责启动/停止 Redis 和周期任务。"""
    mcp_task = None
    vision_task = None
    kb_task = None
    try:
        # Ensure default vision config exists
        ensure_default_vision_config()

        mcp_task = asyncio.create_task(periodic_mcp_check(app))
        vision_task = asyncio.create_task(periodic_vision_cleanup())
        redis_manager = RedisManager()
        app.state.redis_manager = redis_manager

        # ai-kb / RAG 初始化放后台执行：embedding probe 可能慢/重试（默认 30s×4 次），
        # 绝不能阻塞服务就绪，否则 /health 长时间不可用、容器迟迟不 healthy。
        # kb_loaded 默认 False，后台 _init_kb 就绪后翻 True；RAG 未就绪时聊天自动降级。
        app.state.kb_loaded = False
        kb_task = asyncio.create_task(_init_kb(app))

        logger.info("✅ 初始化成功")
    except Exception as exc:
        logger.info(f"❌ 初始化失败: {str(exc)}")
    try:
        yield
    finally:
        for task in [mcp_task, vision_task, kb_task]:
            if task is not None:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        logger.info("✅ 定时任务已停止")
        logger.info("🛑 AI服务正在关闭...")
