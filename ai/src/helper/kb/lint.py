"""
ai-kb 内容 lint

校验：
- frontmatter 必填字段非空
- enum 字段在受控词表内（type / scope / locale / feature / related_tools）
- aliases ≥ 1 条且每条 ≥ 2 字符
- last_verified 格式 vX.Y.Z
- 正文长度 200-1500 字符
- 不含跨 chunk 指代词
- xref [[id]] 目标存在
"""

import argparse
import glob as _glob
import logging
import os
import re
import sys
from typing import Dict, List, Set, Tuple

import yaml

try:
    import frontmatter
except ImportError:
    frontmatter = None

logger = logging.getLogger("ai.kb.lint")

REQUIRED_FIELDS = ("id", "title", "type", "feature", "scope", "locale", "aliases", "last_verified")
TYPE_ENUM = {"concept", "howto", "faq", "menu-map", "glossary", "shortcut"}
SCOPE_ENUM = {"end-user", "admin", "super-admin"}
LOCALE_ENUM = {"zh", "en"}
VERSION_RE = re.compile(r"^v\d+\.\d+\.\d+$")
XREF_RE = re.compile(r"\[\[([a-z0-9._-]+)\]\]")
BAD_REFERENCE_PHRASES = (
    "如上图", "如上所述", "如前文", "如前所述",
    "在前面的", "参见上节", "见上文", "如上图所示",
)
MIN_BODY = 200
MAX_BODY = 1500


def _load_feature_set(kb_root: str) -> Set[str]:
    path = os.path.join(kb_root, "_meta", "feature-map.yaml")
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return {f["id"] for f in (data.get("features") or []) if f.get("id")}


def _load_tool_set(kb_root: str) -> Set[str]:
    path = os.path.join(kb_root, "_meta", "tool-binding.yaml")
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return set((data.get("tools") or {}).keys())


def _is_content_md(rel: str) -> bool:
    """判定是否是 chunk 内容文件（排除 README / _schema / _meta / _eval）。"""
    parts = rel.replace(os.sep, "/").split("/")
    if parts[0] in ("_schema", "_meta", "_eval"):
        return False
    if rel.endswith("README.md"):
        return False
    return rel.endswith(".md")


def _scan_all_ids(kb_root: str) -> Set[str]:
    ids = set()
    for path in _glob.glob(os.path.join(kb_root, "**", "*.md"), recursive=True):
        rel = os.path.relpath(path, kb_root)
        if not _is_content_md(rel):
            continue
        try:
            post = frontmatter.load(path)
            if post.metadata.get("id"):
                ids.add(post.metadata["id"])
        except Exception:
            pass
    return ids


def lint_file(
    rel_path: str,
    kb_root: str,
    feature_set: Set[str],
    tool_set: Set[str],
    all_ids: Set[str],
) -> List[str]:
    """lint 单文件，返回错误清单（空表示通过）。"""
    full = os.path.join(kb_root, rel_path)
    errors: List[str] = []

    if frontmatter is None:
        return ["missing dependency: python-frontmatter"]

    try:
        post = frontmatter.load(full)
    except Exception as e:
        return [f"frontmatter parse error: {e}"]

    fm = post.metadata or {}
    body = post.content or ""

    for field in REQUIRED_FIELDS:
        if not fm.get(field):
            errors.append(f"missing required field: {field}")

    if fm.get("type") and fm["type"] not in TYPE_ENUM:
        errors.append(f"invalid type: {fm['type']}, must be one of {sorted(TYPE_ENUM)}")
    if fm.get("scope") and fm["scope"] not in SCOPE_ENUM:
        errors.append(f"invalid scope: {fm['scope']}, must be one of {sorted(SCOPE_ENUM)}")
    if fm.get("locale") and fm["locale"] not in LOCALE_ENUM:
        errors.append(f"invalid locale: {fm['locale']}, must be one of {sorted(LOCALE_ENUM)}")
    if fm.get("feature") and fm["feature"] not in feature_set:
        errors.append(f"invalid feature: {fm['feature']} (not in _meta/feature-map.yaml)")
    if fm.get("last_verified") and not VERSION_RE.match(str(fm["last_verified"])):
        errors.append(f"invalid last_verified format: {fm['last_verified']} (need vX.Y.Z)")

    aliases = fm.get("aliases") or []
    if isinstance(aliases, list):
        if len(aliases) < 1:
            errors.append("aliases must have at least 1 entry")
        for a in aliases:
            if not a or len(str(a)) < 2:
                errors.append(f"alias too short: {a!r}")
    else:
        errors.append("aliases must be a list")

    related_tools = fm.get("related_tools") or []
    if isinstance(related_tools, list):
        for t in related_tools:
            if t not in tool_set:
                errors.append(f"unknown tool in related_tools: {t} (not in _meta/tool-binding.yaml)")
    else:
        errors.append("related_tools must be a list")

    body_stripped = body.strip()
    body_len = len(body_stripped)
    if body_len < MIN_BODY:
        errors.append(f"body too short: {body_len} < {MIN_BODY}")
    if body_len > MAX_BODY:
        errors.append(f"body too long: {body_len} > {MAX_BODY}")

    for phrase in BAD_REFERENCE_PHRASES:
        if phrase in body:
            errors.append(f"cross-chunk reference detected: {phrase!r}")

    for xref in XREF_RE.findall(body):
        if xref not in all_ids:
            errors.append(f"broken xref: [[{xref}]]")

    return errors


def lint_all(kb_root: str) -> Tuple[int, int, Dict[str, List[str]]]:
    """lint 整个 kb_root；返回 (total, bad_count, errors_by_file)。"""
    feature_set = _load_feature_set(kb_root)
    tool_set = _load_tool_set(kb_root)
    all_ids = _scan_all_ids(kb_root)

    files_with_errors: Dict[str, List[str]] = {}
    total = 0

    for path in sorted(_glob.glob(os.path.join(kb_root, "**", "*.md"), recursive=True)):
        rel = os.path.relpath(path, kb_root)
        if not _is_content_md(rel):
            continue
        total += 1
        errs = lint_file(rel, kb_root, feature_set, tool_set, all_ids)
        if errs:
            files_with_errors[rel] = errs

    return total, len(files_with_errors), files_with_errors


def _main():
    parser = argparse.ArgumentParser(description="ai-kb lint")
    parser.add_argument("--kb-root", default=os.environ.get("KB_CONTENT_DIR", "/app/kb-content"))
    args = parser.parse_args()

    total, bad, errors = lint_all(args.kb_root)

    if not bad:
        print(f"OK: {total} content files, 0 errors")
        sys.exit(0)

    for rel, errs in sorted(errors.items()):
        print(f"\n{rel}:")
        for e in errs:
            print(f"  - {e}")
    print(f"\n{bad}/{total} files have errors")
    sys.exit(1)


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    _main()
