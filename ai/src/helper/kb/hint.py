"""
RAG system prompt hint

给 /chat 与 /invoke/stream 共用：在 pre_context 注入帮助文档检索的硬约束 SystemMessage。
"""

from typing import List

from langchain_core.messages import SystemMessage

RAG_HINT_ZH = (
    "【硬性约束 - 帮助文档优先】\n"
    "当用户询问 DooTask 产品功能用法、概念定义、菜单/按钮位置、"
    "操作步骤或错误含义时，你必须先调用 search_help_docs 工具检索帮助文档"
    "（参数 locale='zh'）。\n"
    "回答规则：\n"
    "1. 只陈述检索片段里写明的事实；片段优先于你的固有知识，两者冲突时以片段为准。\n"
    "2. 片段没有写到的细节（数字、时间间隔、按钮名称、内部实现机制）一律不要补——"
    "编造视为严重错误；不确定时写『文档未说明这一点』。\n"
    "3. 片段只覆盖问题的一部分时，先答已覆盖的部分，再明确指出哪部分文档未说明，"
    "不要因为缺一部分就整体拒答。\n"
    "4. 完全未检索到相关内容时，直接回复"
    "『我在帮助文档里没找到相关内容，建议联系管理员』。\n"
    "回复末尾以『参考：source-id1, source-id2』格式列出引用的 source。"
)

RAG_HINT_EN = (
    "[Hard constraint - help docs first]\n"
    "When the user asks about DooTask product features, concepts, menu/button "
    "locations, step-by-step instructions, or error meanings, you MUST first "
    "call the search_help_docs tool (locale='en').\n"
    "Answering rules:\n"
    "1. State only facts written in the retrieved chunks; chunks take precedence "
    "over your own knowledge when they conflict.\n"
    "2. Never add details the chunks do not state (numbers, intervals, button "
    "names, internal mechanisms) - fabrication is a critical error; when unsure "
    "say 'the docs do not specify this'.\n"
    "3. If chunks cover only part of the question, answer the covered part and "
    "explicitly note what the docs do not specify - do not refuse entirely.\n"
    "4. If nothing relevant is retrieved, reply 'I could not find relevant help "
    "docs. Please contact your admin.'\n"
    "End with 'References: source-id1, source-id2'."
)


def get_hint(locale: str = "zh") -> str:
    return RAG_HINT_EN if locale == "en" else RAG_HINT_ZH


def already_injected(pre_context: List) -> bool:
    """检查 pre_context 是否已含 RAG hint。"""
    for msg in pre_context:
        if isinstance(msg, SystemMessage) and "search_help_docs" in (msg.content or ""):
            return True
    return False


def inject_rag_hint(pre_context: List, locale: str = "zh") -> List:
    """在 pre_context 末尾追加 RAG hint。

    - 若已有 SystemMessage：合并到第一条（与 MCP hint 注入模式一致）
    - 否则插入新 SystemMessage 到队首

    返回修改后的 pre_context（原地修改 + 返回引用）。
    """
    if already_injected(pre_context):
        return pre_context

    hint = get_hint(locale)
    for i, msg in enumerate(pre_context):
        if isinstance(msg, SystemMessage):
            pre_context[i] = SystemMessage(content=f"{msg.content}\n\n{hint}")
            return pre_context
    pre_context.insert(0, SystemMessage(content=hint))
    return pre_context
