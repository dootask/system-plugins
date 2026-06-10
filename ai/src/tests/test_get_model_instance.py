"""Unit tests for thinking-effort → provider param mapping in get_model_instance.

These patch the langchain model classes inside helper.utils with a capturer so we
can assert on the exact constructor kwargs without any network/SDK dependency.
"""
import pytest

import helper.utils as utils


class _Capture:
    """Stand-in model class that just records the kwargs it was built with."""
    def __init__(self, **kwargs):
        self.kwargs = kwargs


@pytest.fixture(autouse=True)
def patch_models(monkeypatch):
    for name in (
        "ChatOpenAI", "ChatAnthropic", "ChatGoogleGenerativeAI", "ChatDeepSeek",
        "ChatZhipuAI", "ChatTongyi", "ChatCohere", "ChatOllama", "ChatXAI",
    ):
        monkeypatch.setattr(utils, name, _Capture, raising=True)


def build(model_type, model_name="some-model", **kw):
    return utils.get_model_instance(model_type, model_name, "key", **kw).kwargs


# --- openai ---------------------------------------------------------------

@pytest.mark.parametrize("level", ["low", "medium", "high"])
def test_openai_reasoning_effort(level):
    cfg = build("openai", "gpt-4o", thinking_effort=level)
    assert cfg["reasoning_effort"] == level


def test_openai_off_non_gpt5_has_no_effort():
    cfg = build("openai", "gpt-4o", thinking_effort="off")
    assert "reasoning_effort" not in cfg


def test_openai_off_gpt5_keeps_auto_effort():
    cfg = build("openai", "gpt-5.4", thinking_effort="off")
    assert cfg["reasoning_effort"] == "low"


# --- claude ---------------------------------------------------------------

@pytest.mark.parametrize("level,budget", [("low", 2048), ("medium", 8192), ("high", 16384)])
def test_claude_budget_tokens(level, budget):
    cfg = build("claude", "claude-opus-4-8", thinking_effort=level)
    assert cfg["thinking"] == {"type": "enabled", "budget_tokens": budget}
    assert cfg["max_tokens"] > budget


def test_claude_off_has_no_thinking():
    cfg = build("claude", "claude-opus-4-8", thinking_effort="off")
    assert "thinking" not in cfg


# --- deepseek -------------------------------------------------------------

@pytest.mark.parametrize("level,budget", [("low", 2048), ("medium", 8192), ("high", 16384)])
def test_deepseek_extra_body_budget(level, budget):
    cfg = build("deepseek", "deepseek-v4-pro", thinking_effort=level)
    assert cfg["extra_body"]["thinking"] == {"type": "enabled", "budget_tokens": budget}


# --- ollama ---------------------------------------------------------------

def test_ollama_reasoning_flag():
    assert build("ollama", thinking_effort="medium")["reasoning"] is True
    assert "reasoning" not in build("ollama", thinking_effort="off")


# --- providers without thinking support -----------------------------------

@pytest.mark.parametrize("model_type", ["gemini", "grok", "zhipu", "qwen", "wenxin", "cohere"])
def test_no_thinking_providers(model_type):
    cfg = build(model_type, thinking_effort="high")
    assert "thinking" not in cfg
    assert "reasoning_effort" not in cfg
    assert "extra_body" not in cfg
    assert "reasoning" not in cfg


# --- legacy thinking int compat -------------------------------------------

def test_legacy_thinking_int_treated_as_medium():
    assert build("claude", "claude-opus-4-8", thinking=1)["thinking"]["budget_tokens"] == 8192
    assert build("openai", "gpt-4o", thinking=1)["reasoning_effort"] == "medium"


def test_legacy_thinking_zero_is_off():
    assert "thinking" not in build("claude", "claude-opus-4-8", thinking=0)
