from __future__ import annotations

import logging
from typing import Dict, List, Optional, TypedDict

import httpx

from helper.config import DEFAULT_MODELS

logger = logging.getLogger("ai")

class ModelInfo(TypedDict, total=False):
    """模型信息类型定义"""
    id: str
    name: str
    support_mcp: bool
    support_vision: bool
    thinking: str  # off | low | medium | high，缺省视为 off

class ModelListError(Exception):
    """Raised when model list retrieval fails."""


# 各厂商「获取模型列表」上游约定（参考 new-api 的渠道处理）：
# - base：未填 base_url 时使用的默认上游根地址（不含版本段）
# - path：模型列表资源路径；若用户填的 base_url 已含版本段，则只追加 /models
# - auth：鉴权方式 bearer | anthropic | gemini
UPSTREAM_SPECS: Dict[str, Dict[str, str]] = {
    "openai":   {"base": "https://api.openai.com",                  "path": "/v1/models",                 "auth": "bearer"},
    "claude":   {"base": "https://api.anthropic.com",               "path": "/v1/models",                 "auth": "anthropic"},
    "deepseek": {"base": "https://api.deepseek.com",                "path": "/v1/models",                 "auth": "bearer"},
    "gemini":   {"base": "https://generativelanguage.googleapis.com", "path": "/v1beta/models",          "auth": "gemini"},
    "grok":     {"base": "https://api.x.ai",                        "path": "/v1/models",                 "auth": "bearer"},
    "zhipu":    {"base": "https://open.bigmodel.cn",                "path": "/api/paas/v4/models",        "auth": "bearer"},
    "qianwen":  {"base": "https://dashscope.aliyuncs.com",          "path": "/compatible-mode/v1/models", "auth": "bearer"},
    "wenxin":   {"base": "https://qianfan.baidubce.com",            "path": "/v2/models",                 "auth": "bearer"},
}

# 用户填写的 base_url 已包含的版本段（出现时只追加 /models，避免 /v1/v1/models）
_VERSION_TAILS = ("/v1", "/v1beta", "/v2", "/compatible-mode/v1", "/api/paas/v4")


def _build_models_url(base: str, path: str) -> str:
    """拼接模型列表 URL；base 若已带版本段则只追加 /models。"""
    base = base.rstrip("/")
    for tail in _VERSION_TAILS:
        if base.endswith(tail):
            return base + "/models"
    return base + path


def _enrich_models(model_type: str, ids: List[str]) -> List[ModelInfo]:
    """按上游返回的 id 列表生成模型项；已知模型用 DEFAULT_MODELS 补全元数据。"""
    presets = {
        str(item.get("id")): item
        for item in (DEFAULT_MODELS.get(model_type) or [])
        if isinstance(item, dict) and item.get("id")
    }
    formatted: List[ModelInfo] = []
    seen = set()
    for raw_id in ids:
        model_id = str(raw_id).strip()
        if not model_id or model_id in seen:
            continue
        seen.add(model_id)
        preset = presets.get(model_id)
        if preset:
            formatted.append({
                "id": model_id,
                "name": str(preset.get("name") or model_id),
                "support_mcp": bool(preset.get("support_mcp", False)),
                "support_vision": bool(preset.get("support_vision", False)),
                "thinking": str(preset.get("thinking") or "off"),
            })
        else:
            formatted.append({
                "id": model_id,
                "name": model_id,
                "support_mcp": False,
                "support_vision": False,
                "thinking": "off",
            })
    return formatted


def _request_json(url: str, headers: Dict[str, str], agency: Optional[str] = None) -> object:
    """GET 一个 JSON 接口，统一异常为 ModelListError。"""
    request_kwargs: Dict[str, object] = {"headers": headers, "timeout": 15}
    if agency:
        request_kwargs["proxies"] = agency
    try:
        with httpx.Client(**request_kwargs) as client:
            response = client.get(url)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        raise ModelListError(f"获取失败：HTTP {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise ModelListError(f"获取失败：{exc}") from exc
    except ValueError as exc:
        raise ModelListError("获取失败：响应解析错误") from exc


def _fetch_openai_compatible_models(
    model_type: str,
    spec: Dict[str, str],
    base_url: str,
    key: str,
    agency: Optional[str] = None,
) -> Dict[str, object]:
    """OpenAI 兼容（含 claude/zhipu/qianwen/wenxin 等）：GET .../models，返回 {data:[{id}]}。"""
    if not key:
        raise ModelListError("请先填写 API Key")

    base = (base_url or spec["base"]).strip()
    url = _build_models_url(base, spec["path"])

    headers: Dict[str, str] = {"Content-Type": "application/json"}
    if spec["auth"] == "anthropic":
        headers["x-api-key"] = key
        headers["anthropic-version"] = "2023-06-01"
    else:
        headers["Authorization"] = f"Bearer {key}"

    data = _request_json(url, headers, agency)
    items = data.get("data") if isinstance(data, dict) else None
    if not isinstance(items, list):
        raise ModelListError("获取失败：无效的返回结构")

    ids: List[str] = []
    for item in items:
        if isinstance(item, dict) and item.get("id"):
            ids.append(str(item["id"]))

    formatted = _enrich_models(model_type, ids)
    if not formatted:
        raise ModelListError("未找到模型")
    return {"models": formatted, "original": items}


def _fetch_gemini_models(
    spec: Dict[str, str],
    base_url: str,
    key: str,
    agency: Optional[str] = None,
) -> Dict[str, object]:
    """Gemini：GET .../v1beta/models（翻页），返回 {models:[{name:"models/xxx"}]}，去前缀。"""
    if not key:
        raise ModelListError("请先填写 API Key")

    base = (base_url or spec["base"]).strip()
    url = _build_models_url(base, spec["path"])
    headers = {"Content-Type": "application/json", "x-goog-api-key": key}

    ids: List[str] = []
    raw_all: List[object] = []
    next_token = ""
    for _ in range(100):  # 翻页上限，避免异常死循环
        page_url = f"{url}?pageToken={next_token}" if next_token else url
        data = _request_json(page_url, headers, agency)
        models = data.get("models") if isinstance(data, dict) else None
        if not isinstance(models, list):
            raise ModelListError("获取失败：无效的返回结构")
        raw_all.extend(models)
        for item in models:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            if not name:
                continue
            ids.append(str(name).split("/", 1)[-1] if str(name).startswith("models/") else str(name))
        next_token = data.get("nextPageToken") if isinstance(data, dict) else ""
        if not next_token:
            break

    formatted = _enrich_models("gemini", ids)
    if not formatted:
        raise ModelListError("未找到模型")
    return {"models": formatted, "original": raw_all}


def _fetch_ollama_models(
    base_url: str,
    key: Optional[str] = None,
    agency: Optional[str] = None,
) -> Dict[str, object]:
    if not base_url:
        raise ModelListError("请先填写 Base URL")

    headers: Dict[str, str] = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"

    url = base_url.rstrip("/") + "/api/tags"
    data = _request_json(url, headers, agency)

    models = data.get("models") if isinstance(data, dict) else None
    if not isinstance(models, list):
        raise ModelListError("获取失败：无效的返回结构")

    formatted: List[ModelInfo] = []
    for item in models:
        if not isinstance(item, dict):
            continue
        model_name = item.get("model")
        display_name = item.get("name")
        if not model_name:
            continue
        formatted.append({
            "id": str(model_name),
            "name": display_name if display_name and display_name != model_name else str(model_name),
            "support_mcp": False,
            "thinking": "off"
        })

    if not formatted:
        raise ModelListError("未找到模型")

    return {"models": formatted, "original": models}


def _fetch_dootask_models(
    base_url: str,
    key: Optional[str] = None,
) -> Dict[str, object]:
    """从 DooTask 官方网关（AppStore 计量代理）拉取该 token 档位可见的模型列表。

    base_url 形如 https://appstore.dootask.com/v1，返回 OpenAI list 格式。
    """
    if not base_url:
        raise ModelListError("缺少网关地址")
    if not key:
        raise ModelListError("请先登录 DooTask 账号")

    headers: Dict[str, str] = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}",
    }
    url = base_url.rstrip("/") + "/models"
    data = _request_json(url, headers)

    items = data.get("data") if isinstance(data, dict) else None
    if not isinstance(items, list):
        raise ModelListError("获取失败：无效的返回结构")

    formatted: List[ModelInfo] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id")
        if not model_id:
            continue
        formatted.append({
            "id": str(model_id),
            "name": str(item.get("name") or model_id),
            "support_mcp": True,
            "thinking": "off",
        })

    if not formatted:
        raise ModelListError("未找到模型")

    return {"models": formatted, "original": items}


def get_models_list(
    model_type: str,
    base_url: Optional[str] = None,
    key: Optional[str] = None,
    agency: Optional[str] = None,
) -> Dict[str, object]:
    """Retrieve models list data for the given model type by querying upstream."""
    model_type = (model_type or "").strip().lower()
    if not model_type:
        raise ModelListError("缺少参数 type")

    if model_type == "ollama":
        return _fetch_ollama_models(base_url=base_url or "", key=key or None, agency=agency or None)

    if model_type == "dootask":
        return _fetch_dootask_models(base_url=base_url or "", key=key or None)

    spec = UPSTREAM_SPECS.get(model_type)
    if not spec:
        raise ModelListError("不支持的厂商类型")

    if spec["auth"] == "gemini":
        return _fetch_gemini_models(spec, base_url or "", key or "", agency or None)

    return _fetch_openai_compatible_models(model_type, spec, base_url or "", key or "", agency or None)
