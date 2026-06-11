"""
页面深链 system prompt hint

给 /chat 与 /invoke/stream 共用：教会模型把回复正文里"可定位的页面/面板"词
渲染成内联深链 [显示文字](dootask://link/<id>)。前端据主仓库
resources/ai-kb/_meta/page-links.yaml（只读挂载到 KB_CONTENT_DIR）校验，
渲染成可点蓝色链接，点击直达该页面。

替代原 driver.js 分步引导（ai-guide 围栏 + show_guide 工具，已下线）。
注入模式与 hint.py（RAG hint）一致：合并进首条 SystemMessage。

提示词刻意精简：只写模型无法自知的系统事实——id 闭集（前端按此校验）、
深链能力边界（只到页面级）、输出语法（一个 few-shot 锁 markdown 格式）。
"怎么表达得体"（去重/用词/克制）交给模型自行把握，不写规则。
"""

import os
from functools import lru_cache
from typing import List

import yaml
from langchain_core.messages import SystemMessage

# 去重标记：判断 pre_context 是否已注入本 hint
DEEPLINK_MARKER = "dootask://link/"


def _kb_root() -> str:
    # 与 helper/kb/ingest.py 的 _kb_root 一致
    return os.environ.get("KB_CONTENT_DIR", "/app/kb-content")


@lru_cache(maxsize=1)
def _load_catalog() -> tuple:
    """从 _meta/page-links.yaml 读取深链目录（id/title/description）。失败返回空。"""
    path = os.path.join(_kb_root(), "_meta", "page-links.yaml")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    except Exception:
        return tuple()
    links = data.get("links", {}) or {}
    items = []
    for lid, meta in links.items():
        meta = meta or {}
        items.append((lid, meta.get("title", lid), meta.get("description", "")))
    return tuple(items)


def _catalog_lines() -> str:
    rows = []
    for lid, title, desc in _load_catalog():
        rows.append(f"- {lid}：{title}" + (f" — {desc}" if desc else ""))
    return "\n".join(rows)


def _build_hint_zh() -> str:
    catalog = _catalog_lines()
    if not catalog:
        return ""
    return (
        "【页面深链】\n"
        "回复里提到下表中的页面/面板时，把它写成 markdown 链接 "
        "[显示文字](dootask://link/<id>)；前端会渲染成可点击的蓝色链接，用户点一下直达该页。\n"
        "两点系统约束（其余你自行把握）：\n"
        "1. <id> 只能取下表的值（前端按此闭集校验，臆造的 id 会失效）；拿不准就用纯文字、不要加链接。\n"
        "2. 深链只能到“页面级”，无法定位页面内某个开关/按钮——故页面内的具体操作仍用文字说明。\n"
        "可用目的地（id：标题 — 说明）：\n"
        f"{catalog}\n"
        "示例：在 [系统设置](dootask://link/setting_system) 的消息相关里可开启端到端加密。"
    )


def _build_hint_en() -> str:
    catalog = _catalog_lines()
    if not catalog:
        return ""
    return (
        "[Page deep links]\n"
        "When your reply mentions a page/panel listed below, write it as a markdown link "
        "[label](dootask://link/<id>); the frontend renders it as a clickable link that takes "
        "the user straight to that screen.\n"
        "Two system constraints (use your own judgment for the rest):\n"
        "1. <id> MUST be one of the values below (the frontend validates against this closed "
        "set; invented ids silently fail). If unsure, use plain text with no link.\n"
        "2. A deep link only reaches the page level — it cannot target a specific toggle/button "
        "inside the page, so describe in-page actions in text.\n"
        "Available destinations (id: title — note):\n"
        f"{catalog}\n"
        "Example: open end-to-end encryption under [System settings](dootask://link/setting_system)."
    )


def get_guide_hint(locale: str = "zh") -> str:
    return _build_hint_en() if locale == "en" else _build_hint_zh()


def guide_already_injected(pre_context: List) -> bool:
    """检查 pre_context 是否已含深链 hint。"""
    for msg in pre_context:
        if isinstance(msg, SystemMessage) and DEEPLINK_MARKER in (msg.content or ""):
            return True
    return False


def inject_guide_hint(pre_context: List, locale: str = "zh") -> List:
    """在 pre_context 注入深链 hint（合并到首条 SystemMessage，与 RAG hint 模式一致）。

    目录加载失败（hint 为空）时直接跳过，不污染上下文。
    """
    hint = get_guide_hint(locale)
    if not hint or guide_already_injected(pre_context):
        return pre_context

    for i, msg in enumerate(pre_context):
        if isinstance(msg, SystemMessage):
            pre_context[i] = SystemMessage(content=f"{msg.content}\n\n{hint}")
            return pre_context
    pre_context.insert(0, SystemMessage(content=hint))
    return pre_context
