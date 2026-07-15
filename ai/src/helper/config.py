import os
import re
from pathlib import Path

# 路径与基础配置
BASE_DIR = Path(__file__).resolve().parent.parent

# 服务启动端口
SERVER_PORT = int(os.environ.get('PORT', 5001))

# UI 静态资源路径
UI_DIST_PATH = BASE_DIR / "static" / "ui"

# 清空上下文的命令
CLEAR_COMMANDS = [":clear", ":reset", ":restart", ":new", ":清空上下文", ":重置上下文", ":重启", ":重启对话"]

# 流式响应超时时间
STREAM_TIMEOUT = 300

# DooTask 主程序地址（检索打点回调等服务端到服务端请求）
MAIN_SERVER_URL = os.environ.get("MAIN_SERVER_URL", "http://nginx")

# DooTask 官方 AI 厂商（计量代理）网关地址与安装实例标识。
# 安装时由 AppStore 注入；插件以此自助 provision 账号、代理账号操作、拉模型列表。
DOOTASK_AI_GATEWAY_URL = os.environ.get("DOOTASK_AI_GATEWAY_URL", "").rstrip("/")
DOOTASK_AI_INSTANCE_ID = os.environ.get("DOOTASK_AI_INSTANCE_ID", "")

# 主程序全局 APP_KEY（内置 compose 变量 ${APP_KEY} 注入）。
# 用于服务端到服务端调用（如主程序 → 本插件 /embeddings）的共享密钥鉴权。
APP_KEY = os.environ.get("APP_KEY", "")

# 自定义 MCP 配置文件路径（用户自接的外部 MCP 服务器）
MCP_CONFIG_PATH = BASE_DIR / "config" / "mcp-config.json"

# Vision 配置文件路径
VISION_CONFIG_PATH = BASE_DIR / "config" / "vision-config.json"
VISION_DATA_DIR = BASE_DIR / "data" / "vision"
VISION_PREVIEW_URL_PREFIX = "http://nginx/ai/vision/preview"
VISION_CLEANUP_DAYS = 7
VISION_CLEANUP_INTERVAL = 86400  # 24 hours in seconds

# LangChain 思考标记正则
THINK_START_PATTERN = re.compile(r'<think>\s*')
THINK_END_PATTERN = re.compile(r'\s*</think>')
REASONING_PATTERN = re.compile(r'::: reasoning\n.*?:::', re.DOTALL)

# 工具调用标记的正则模式
TOOL_CALL_PATTERN = re.compile(r'\n?> <tool-use>Tool: [^<]+</tool-use>\n*')

# 默认模型列表
DEFAULT_MODELS = {
    "openai": [
        {"id": "gpt-5.6-sol", "name": "GPT-5.6 Sol", "support_mcp": True, "support_vision": True},
        {"id": "gpt-5.6-terra", "name": "GPT-5.6 Terra", "support_mcp": True, "support_vision": True},
        {"id": "gpt-5.6-luna", "name": "GPT-5.6 Luna", "support_mcp": True, "support_vision": True},
        {"id": "gpt-5.5", "name": "GPT-5.5", "support_mcp": True, "support_vision": True},
        {"id": "gpt-5.4-mini", "name": "GPT-5.4 Mini", "support_mcp": True, "support_vision": True},
        {"id": "gpt-5.4-nano", "name": "GPT-5.4 Nano", "support_mcp": True, "support_vision": True},
        {"id": "o4-mini", "name": "o4 Mini", "support_mcp": True, "support_vision": True},
    ],
    "claude": [
        {"id": "claude-fable-5", "name": "Claude Fable 5", "support_mcp": True, "support_vision": True, "thinking": "off"},
        {"id": "claude-opus-4-8", "name": "Claude Opus 4.8", "support_mcp": True, "support_vision": True, "thinking": "off"},
        {"id": "claude-sonnet-5", "name": "Claude Sonnet 5", "support_mcp": True, "support_vision": True, "thinking": "off"},
        {"id": "claude-opus-4-7", "name": "Claude Opus 4.7", "support_mcp": True, "support_vision": True, "thinking": "medium"},
        {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6", "support_mcp": True, "support_vision": True, "thinking": "medium"},
        {"id": "claude-haiku-4-5", "name": "Claude Haiku 4.5", "support_mcp": True, "support_vision": True, "thinking": "medium"},
    ],
    "deepseek": [
        {"id": "deepseek-v4-pro", "name": "DeepSeek V4 Pro", "support_mcp": True, "support_vision": False},
        {"id": "deepseek-v4-flash", "name": "DeepSeek V4 Flash", "support_mcp": True, "support_vision": False},
    ],
    "gemini": [
        {"id": "gemini-3.5-flash", "name": "Gemini 3.5 Flash", "support_mcp": True, "support_vision": True},
        {"id": "gemini-3.1-pro-preview", "name": "Gemini 3.1 Pro", "support_mcp": True, "support_vision": True},
        {"id": "gemini-3.1-flash-lite", "name": "Gemini 3.1 Flash Lite", "support_mcp": True, "support_vision": True},
        {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "support_mcp": True, "support_vision": True},
        {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "support_mcp": True, "support_vision": True},
    ],
    "grok": [
        {"id": "grok-4.5", "name": "Grok 4.5", "support_mcp": True, "support_vision": True},
        {"id": "grok-4.3", "name": "Grok 4.3", "support_mcp": True, "support_vision": True},
    ],
    "zhipu": [
        {"id": "glm-5.2", "name": "GLM-5.2", "support_mcp": True, "support_vision": False},
        {"id": "glm-5.1", "name": "GLM-5.1", "support_mcp": True, "support_vision": False},
        {"id": "glm-5", "name": "GLM-5", "support_mcp": True, "support_vision": False},
        {"id": "glm-5-turbo", "name": "GLM-5 Turbo", "support_mcp": True, "support_vision": False},
        {"id": "glm-5v-turbo", "name": "GLM-5V Turbo", "support_mcp": True, "support_vision": True},
        {"id": "glm-4.7", "name": "GLM-4.7", "support_mcp": True, "support_vision": False},
    ],
    "qianwen": [
        {"id": "qwen3.7-max", "name": "Qwen3.7 Max", "support_mcp": True, "support_vision": False},
        {"id": "qwen3.7-plus", "name": "Qwen3.7 Plus", "support_mcp": True, "support_vision": True},
        {"id": "qwen3.6-plus", "name": "Qwen3.6 Plus", "support_mcp": True, "support_vision": True},
        {"id": "qwen3.6-flash", "name": "Qwen3.6 Flash", "support_mcp": True, "support_vision": False},
    ],
    "wenxin": [
        {"id": "ernie-5.1", "name": "ERNIE 5.1", "support_mcp": False, "support_vision": False},
        {"id": "ernie-5.0", "name": "ERNIE 5.0", "support_mcp": False, "support_vision": True},
        {"id": "ernie-5.0-thinking-latest", "name": "ERNIE 5.0 Thinking", "support_mcp": False, "support_vision": True},
        {"id": "ernie-x1.1", "name": "ERNIE X1.1", "support_mcp": False, "support_vision": False},
        {"id": "ernie-4.5-turbo-128k", "name": "ERNIE 4.5 Turbo 128K", "support_mcp": False, "support_vision": False},
    ],
}

# 模型上下文限制（token数）
# 原则：只配置明确知道的，不知道的使用最小值
# 数值为官方文档的原始值
CONTEXT_LIMITS = {
    "openai": {
        # GPT-5.6: 1.05M context
        "gpt-5.6-sol": 1050000,
        "gpt-5.6-terra": 1050000,
        "gpt-5.6-luna": 1050000,
        "gpt-5.5": 1050000,
        "gpt-5.4-mini": 1050000,
        "gpt-5.4-nano": 1050000,
        "o4-mini": 200000,
        "default": 128000,
    },
    "claude": {
        "claude-fable-5": 1000000,
        "claude-opus-4-8": 1000000,
        "claude-sonnet-5": 1000000,
        "claude-opus-4-7": 1000000,
        "claude-sonnet-4-6": 1000000,
        "claude-haiku-4-5": 200000,
        "default": 200000,
    },
    "deepseek": {
        # DeepSeek V4: 1M context
        "deepseek-v4-pro": 1000000,
        "deepseek-v4-flash": 1000000,
        "default": 128000,
    },
    "gemini": {
        # Gemini 3.x/2.5: 1,048,576 context
        "gemini-3.5-flash": 1048576,
        "gemini-3.1-pro-preview": 1048576,
        "gemini-3.1-flash-lite": 1048576,
        "gemini-2.5-pro": 1048576,
        "gemini-2.5-flash": 1048576,
        "default": 1048576,
    },
    "grok": {
        "grok-4.5": 500000,
        "grok-4.3": 1000000,
        "default": 500000,
    },
    "zhipu": {
        "glm-5.2": 1000000,
        "glm-5.1": 200000,
        "glm-5": 200000,
        "glm-5-turbo": 200000,
        "glm-5v-turbo": 200000,
        "glm-4.7": 128000,
        "default": 128000,
    },
    "qianwen": {
        "qwen3.7-max": 1000000,
        "qwen3.7-plus": 1000000,
        "qwen3.6-plus": 1000000,
        "qwen3.6-flash": 1000000,
        "default": 32000,
    },
    "wenxin": {
        "ernie-5.1": 128000,
        "ernie-5.0": 128000,
        "ernie-5.0-thinking-latest": 128000,
        "ernie-x1.1": 64000,
        "ernie-4.5-turbo-128k": 128000,
        "default": 32000,
    },
    "dooai": {
        # 官方网关聚合多家上游（含 GLM 200K 等），取保守默认避免溢出
        "default": 128000,
    },
}
