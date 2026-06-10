"""
Built-in Tools Module

Defines internal tools that are loaded alongside MCP tools.
"""

import json
import logging
import os
from typing import Any, List, Type

from langchain_core.tools import BaseTool
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger("ai")


class GetSessionImageInput(BaseModel):
    """Input schema for get_session_image tool."""

    image_md5: str = Field(description="图片 MD5，从 [picture:session_{md5}] 中提取")


class GetSessionImageTool(BaseTool):
    """Tool for retrieving session images from cache."""

    name: str = "get_session_image"
    description: str = """获取会话中用户上传的图片进行分析。

使用场景：
- 用户询问图片内容、细节或特定区域
- 需要对图片进行文字识别
- 消息中包含 [picture:session_{md5}] 占位符

注意：图片有缓存时效，过期后无法获取。"""

    args_schema: Type[BaseModel] = GetSessionImageInput
    response_format: str = "content_and_artifact"

    redis_manager: Any = Field(exclude=True)

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def _run(self, image_md5: str) -> tuple:
        """Sync version - not implemented."""
        raise NotImplementedError("Use async version")

    async def _arun(self, image_md5: str) -> tuple:
        """Retrieve a session image from cache.

        Args:
            image_md5: MD5 hash of the image (with or without 'session_' prefix)

        Returns:
            Tuple of (content_blocks, artifact)
        """
        # Validate input
        if not image_md5 or len(image_md5) < 8:
            return ([{"type": "text", "text": "无效的图片标识符"}], None)

        # Normalize key (support with or without session_ prefix)
        if image_md5.startswith("session_"):
            md5_hash = image_md5[8:]
        else:
            md5_hash = image_md5

        # Retrieve from cache
        cache_key = f"session_image_{md5_hash}"
        try:
            cached = await self.redis_manager.get_cache(cache_key)
        except Exception as e:
            logger.error(f"Failed to get session image: {e}")
            return ([{"type": "text", "text": f"获取图片失败: {e}"}], None)

        if not cached:
            return ([{"type": "text", "text": "图片不存在或已过期"}], None)

        # Parse cached data
        try:
            cache_data = json.loads(cached)
            base64_data = cache_data["data"]
            mime_type = cache_data.get("mime_type", "image/jpeg")
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"Invalid cache data for session image: {e}")
            return ([{"type": "text", "text": "图片数据格式错误"}], None)

        # Return multimodal content
        return ([{
            "type": "image",
            "mime_type": mime_type,
            "base64": base64_data
        }], None)


class SearchHelpDocsInput(BaseModel):
    """Input schema for search_help_docs tool."""

    query: str = Field(description="用户问题原文，自然语言")
    locale: str = Field(default="zh", description="语种过滤，zh 或 en，默认 zh")


class SearchHelpDocsTool(BaseTool):
    """检索 DooTask 帮助知识库（ai-kb），用于回答功能用法/概念/操作类问题。"""

    name: str = "search_help_docs"
    description: str = """检索 DooTask 帮助知识库。

使用场景（用户提问命中以下任一即应调用）：
- 询问 DooTask 功能用法："看板列怎么改名"、"怎么快速创建任务"
- 询问产品概念定义："什么是子任务"、"工作流和视图什么区别"
- 询问菜单/按钮位置："AI 助手入口在哪"、"审批中心怎么进"
- 询问操作步骤："怎么把任务分配给别人"
- 询问错误含义："权限不足是什么意思"

返回 top-5 相关文档片段。**严禁编造检索结果之外的内容**：
若返回为空或与问题不相关，直接说"我在帮助文档里没找到相关内容"，不要拼凑答案。"""

    args_schema: Type[BaseModel] = SearchHelpDocsInput
    response_format: str = "content_and_artifact"

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def _run(self, query: str, locale: str = "zh") -> tuple:
        raise NotImplementedError("Use async version")

    async def _arun(self, query: str, locale: str = "zh") -> tuple:
        try:
            from helper.kb.retriever import search, format_hits
        except Exception as e:
            logger.error(f"search_help_docs import failed: {e}")
            return ([{"type": "text", "text": "帮助文档检索模块未就绪"}], None)

        try:
            hits = await search(query, locale=locale, top_k=5)
        except Exception as e:
            logger.error(f"search_help_docs search failed: {e}")
            return ([{"type": "text", "text": f"检索失败: {e}"}], None)

        content = format_hits(hits)
        artifact = {"hits": [h["id"] for h in hits], "query": query, "locale": locale}
        return ([{"type": "text", "text": content}], artifact)


def _rag_enabled() -> bool:
    return os.environ.get("RAG_ENABLED", "true").lower() in ("true", "1", "yes")


def load_builtin_tools(redis_manager: Any) -> List[BaseTool]:
    """Load all built-in tools.

    Args:
        redis_manager: Redis manager instance

    Returns:
        List of built-in tools
    """
    tools: List[BaseTool] = [
        GetSessionImageTool(redis_manager=redis_manager),
    ]
    if _rag_enabled():
        tools.append(SearchHelpDocsTool())
    return tools
