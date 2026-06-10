"""
页面引导 system prompt hint

给 /chat 与 /invoke/stream 共用：教会模型生成 ai-guide 围栏脚本（通道A，
前端渲染「带我去」按钮）与调用 show_guide 工具（通道B，用户明确要求时直接启动）。
注入模式与 hint.py（RAG hint）一致。
"""

from typing import List

from langchain_core.messages import SystemMessage

GUIDE_HINT_ZH = (
    "【页面操作引导】\n"
    "回答 DooTask 功能的“怎么做”类问题、且答案包含界面操作步骤时，"
    "在回复最末尾追加一个 ai-guide 围栏代码块（整个回复最多一个），"
    "前端会渲染成「带我去」按钮，用户点击后分步高亮页面元素：\n"
    "```ai-guide\n"
    '{"version":1,"title":"在项目中创建任务","steps":[\n'
    '{"content":"我们先回到工作台。点「下一步」我帮你切换过去。","pre_action":{"type":"action","name":"navigate_to_dashboard"},"target":null},\n'
    '{"title":"找到入口","content":"点击顶部的「新建任务」按钮即可创建任务。","target":{"text":"新建任务","query":"新建任务的按钮"},"placement":"auto"}\n'
    "]}\n"
    "```\n"
    "硬性规则：\n"
    "1. steps 不超过 7 步，每步 content 不超过 80 字，用用户的语言书写。\n"
    "2. **pre_action 在用户点「下一步」离开本步时才执行**（不是进入本步时）：本步 content 要描述"
    "“接下来点下一步会发生什么”，下一步的 target 对应动作执行后的页面状态。\n"
    "3. target 优先写 text（元素在界面上的真实可见文字，用 DooTask 实际用词，如“新建项目”而非“创建项目”）"
    "+ query（元素语义描述，运行时智能匹配近义词）；selector 只允许填 get_page_context 实测返回的选择器，"
    "禁止凭空编写；纯解说步骤 target 填 null。优先指向页面上显眼、可见的顶层按钮/菜单。\n"
    "4. 用户可能不在目标页面：把“跳转/打开”单独作为一步，其 pre_action 为 type=action"
    "（name 取 open_project/open_task/navigate_to_dashboard 等导航操作）；要高亮的元素在菜单/弹窗里时，"
    "先用一步 pre_action type=click 打开它（target 指向触发按钮），下一步再高亮弹窗内元素。\n"
    "5. 当用户明确说“带我去/带我操作/演示一下”且上下文存在 operation_session_id 时，"
    "改为直接调用 show_guide 工具立即启动引导（建议先调 get_page_context 拿真实元素文字/选择器），"
    "并且 show_guide 必须是本轮最后一个工具调用（引导启动会断开页面操作会话）；"
    "此时不要再输出围栏块。没有 operation_session_id 时只用围栏块方式，target 只写 text+query。"
)

GUIDE_HINT_EN = (
    "[Page guide capability]\n"
    "When answering how-to questions about DooTask that involve UI steps, append ONE "
    "ai-guide fenced code block at the very end of your reply (at most one per reply). "
    "The frontend renders it as a 'Show me' button that highlights page elements step by step:\n"
    "```ai-guide\n"
    '{"version":1,"title":"Create a task","steps":[\n'
    '{"content":"Let\'s go to the dashboard first. Click Next and I will take you there.","pre_action":{"type":"action","name":"navigate_to_dashboard"},"target":null},\n'
    '{"title":"Find the entry","content":"Click the “New task” button at the top to create a task.","target":{"text":"New task","query":"button to create a new task"},"placement":"auto"}\n'
    "]}\n"
    "```\n"
    "Hard rules:\n"
    "1. At most 7 steps; each content <= 80 chars; write in the user's language.\n"
    "2. **pre_action runs when the user clicks Next to LEAVE this step** (not when entering it): "
    "this step's content should describe what clicking Next will do; the NEXT step's target "
    "reflects the page state AFTER the action.\n"
    "3. Prefer target.text (the element's real on-screen label, using DooTask's actual wording) "
    "+ target.query (semantic description, matched at runtime incl. synonyms); selector may ONLY "
    "contain selectors returned by get_page_context - never invent one. Use target: null for "
    "narration-only steps. Prefer prominent, visible, top-level buttons/menus.\n"
    "4. The user may not be on the target page: make 'navigate/open' its own step whose pre_action "
    "is type=action (name like open_project/navigate_to_dashboard); to highlight something inside a "
    "menu/dialog, first add a step whose pre_action is type=click on the trigger, then the next step "
    "highlights the element inside.\n"
    "5. When the user explicitly says 'show me / guide me / walk me through' AND "
    "operation_session_id exists in context, call the show_guide tool directly instead "
    "(call get_page_context first for real labels/selectors), and show_guide MUST be "
    "the last tool call of the turn (starting the guide disconnects the operation session); "
    "do not also output the fenced block. Without operation_session_id, only use the fenced block "
    "with target text+query."
)


def get_guide_hint(locale: str = "zh") -> str:
    return GUIDE_HINT_EN if locale == "en" else GUIDE_HINT_ZH


def guide_already_injected(pre_context: List) -> bool:
    """检查 pre_context 是否已含 guide hint。"""
    for msg in pre_context:
        if isinstance(msg, SystemMessage) and "ai-guide" in (msg.content or ""):
            return True
    return False


def inject_guide_hint(pre_context: List, locale: str = "zh") -> List:
    """在 pre_context 注入 guide hint（合并到首条 SystemMessage，与 RAG hint 模式一致）。"""
    if guide_already_injected(pre_context):
        return pre_context

    hint = get_guide_hint(locale)
    for i, msg in enumerate(pre_context):
        if isinstance(msg, SystemMessage):
            pre_context[i] = SystemMessage(content=f"{msg.content}\n\n{hint}")
            return pre_context
    pre_context.insert(0, SystemMessage(content=hint))
    return pre_context
