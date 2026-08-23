from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    HumanMessage,
    message_chunk_to_message,
)
from langchain_openai import ChatOpenAI

from helper.utils import ReasoningCompatibleChatOpenAI, get_model_instance


def build_model():
    return ReasoningCompatibleChatOpenAI(
        model="deepseek-reasoner",
        api_key="test-key",
        streaming=True,
    )


def parse_delta(model, delta):
    generation = model._convert_chunk_to_generation_chunk(
        {
            "choices": [{"delta": delta, "finish_reason": None}],
            "model": "deepseek-reasoner",
        },
        AIMessageChunk,
        {},
    )
    return generation.message


def test_preserves_reasoning_content_from_stream_chunk():
    message = parse_delta(
        build_model(),
        {"role": "assistant", "content": "", "reasoning_content": "thinking"},
    )

    assert message.additional_kwargs["reasoning_content"] == "thinking"


def test_normalizes_reasoning_alias_from_compatible_gateway():
    message = parse_delta(
        build_model(),
        {"role": "assistant", "content": "", "reasoning": "thinking"},
    )

    assert message.additional_kwargs["reasoning_content"] == "thinking"


def test_passes_reasoning_content_back_in_next_request():
    model = build_model()
    messages = [
        HumanMessage(content="Find the documentation"),
        AIMessage(
            content="",
            additional_kwargs={"reasoning_content": "thinking"},
            tool_calls=[
                {
                    "name": "search_help_docs",
                    "args": {"query": "documentation", "locale": "en"},
                    "id": "call-1",
                    "type": "tool_call",
                }
            ],
        ),
    ]

    payload = model._get_request_payload(messages)

    assert payload["messages"][1]["reasoning_content"] == "thinking"


def test_passes_aggregated_reasoning_and_tool_call_back_in_next_request():
    model = build_model()
    reasoning_chunk = parse_delta(
        model,
        {"role": "assistant", "content": "", "reasoning_content": "thinking"},
    )
    tool_call_chunk = parse_delta(
        model,
        {
            "tool_calls": [
                {
                    "index": 0,
                    "id": "call-1",
                    "type": "function",
                    "function": {
                        "name": "search_help_docs",
                        "arguments": '{"query":"documentation","locale":"en"}',
                    },
                }
            ]
        },
    )
    assistant_message = message_chunk_to_message(reasoning_chunk + tool_call_chunk)

    payload = model._get_request_payload(
        [HumanMessage(content="Find the documentation"), assistant_message]
    )

    assert payload["messages"][1]["reasoning_content"] == "thinking"
    assert payload["messages"][1]["tool_calls"][0]["function"]["name"] == (
        "search_help_docs"
    )


def test_standard_openai_messages_remain_unchanged():
    model = build_model()
    messages = [
        HumanMessage(content="Hello"),
        AIMessage(content="Hi"),
    ]

    payload = model._get_request_payload(messages)

    assert all("reasoning_content" not in message for message in payload["messages"])


def test_only_openai_compatible_reasoning_providers_use_compatibility_class():
    openai_model = get_model_instance("openai", "gpt-4o", "test-key")
    dooai_model = get_model_instance("dooai", "deepseek-reasoner", "test-key")
    wenxin_model = get_model_instance("wenxin", "ernie-4.0", "test-key")

    assert type(openai_model) is ReasoningCompatibleChatOpenAI
    assert type(dooai_model) is ReasoningCompatibleChatOpenAI
    assert type(wenxin_model) is ChatOpenAI
