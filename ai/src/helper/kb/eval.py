"""
ai-kb 回归测试：跑 _eval/*.yaml 套件

P0 阶段：
- S1 早期 smoke：golden-v0.yaml（10 题）
- S5 最终验收：golden-50q.yaml（50 题）

指标：
- recall@k          retriever 层；正例桶 expected_chunk_ids 任一命中 → 1
- answer_correct    LLM-judge；需 --judge / JUDGE_MODEL 配置，否则跳过
- honest_refuse     honest-negative 桶；must_say 关键词命中 → 1（不需要 LLM）

LLM-judge 流程（每题）：
  retrieve top-k → 构造 RAG 提示喂 LLM 答 → 另一个 LLM 当 judge 0/1
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from typing import Any, Dict, List, Optional, Tuple

import yaml

from .hint import get_hint
from .retriever import format_hits, search

logger = logging.getLogger("ai.kb.eval")


# ------------------ recall layer ------------------

async def run_recall_one(test: Dict[str, Any], top_k: int = 5) -> Dict[str, Any]:
    """单题 recall 评分。"""
    q = test["q"]
    locale = test.get("locale", "zh")
    expected_ids = test.get("expected_chunk_ids", []) or []
    bucket = test.get("bucket", "easy")

    hits = await search(q, locale=locale, top_k=top_k)
    returned_ids = [h["id"] for h in hits]

    if bucket == "honest-negative":
        return {
            "id": test["id"],
            "bucket": bucket,
            "recall_at_k": None,  # 不参评 recall
            "returned": returned_ids,
            "hits": hits,
        }

    hit = any(eid in returned_ids for eid in expected_ids)
    return {
        "id": test["id"],
        "bucket": bucket,
        "recall_at_k": 1 if hit else 0,
        "expected": expected_ids,
        "returned": returned_ids,
        "hits": hits,
    }


# ------------------ LLM helpers ------------------

def _resolve_judge_config(args) -> Optional[Dict[str, str]]:
    """优先取 CLI 参数；其次取环境变量；不全则禁用 judge。"""
    model = args.judge or os.environ.get("JUDGE_MODEL")
    if not model:
        return None
    base_url = args.judge_base_url or os.environ.get("JUDGE_BASE_URL")
    api_key = args.judge_api_key or os.environ.get("JUDGE_API_KEY")
    if not api_key:
        logger.warning("JUDGE_MODEL set but no api_key; LLM-judge disabled.")
        return None
    return {"model": model, "base_url": base_url, "api_key": api_key}


def _make_llm(cfg: Dict[str, str], temperature: float = 0.0, max_tokens: int = 1024):
    """构造一个 OpenAI 兼容 LLM client（judge 用 claude/gpt 都走 openai-compat 协议）。"""
    from langchain_openai import ChatOpenAI

    kwargs: Dict[str, Any] = {
        "model": cfg["model"],
        "api_key": cfg["api_key"],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if cfg.get("base_url"):
        kwargs["base_url"] = cfg["base_url"]
    return ChatOpenAI(**kwargs)


async def _answer_with_rag(
    test: Dict[str, Any],
    hits: List[Dict[str, Any]],
    answerer_cfg: Dict[str, str],
) -> str:
    """用召回片段构造 RAG 提示，让 answerer LLM 给出回答。

    简化：不走 tool-calling（main.py 的完整链路）。把 top-k 片段拼到 system message，
    要求 LLM 仅基于片段作答 / 找不到时拒答。这种近似足够评估 RAG 的"忠实性"维度。
    """
    from langchain_core.messages import HumanMessage, SystemMessage

    locale = test.get("locale", "zh")
    docs_block = format_hits(hits)
    sys_prompt = (
        get_hint(locale)
        + "\n\n以下是检索到的相关帮助文档片段（按相关度从高到低）：\n\n"
        + docs_block
        + "\n\n请基于上述片段作答；若片段不相关或为空，必须明确说明『我在帮助文档里没找到相关内容』。"
    )

    llm = _make_llm(answerer_cfg, temperature=0.0)
    msg = await llm.ainvoke([SystemMessage(content=sys_prompt), HumanMessage(content=test["q"])])
    return (msg.content or "").strip() if hasattr(msg, "content") else str(msg)


_JUDGE_PROMPT = (
    "你是 RAG 回归测试的 judge，对一道题做两项独立评估，只输出严格 JSON。\n\n"
    "任务一【要点覆盖】：从「参考答案」中提取 2-6 个**直接回答该问题所必需**的"
    "原子要点（nugget）——参考答案里与问题没有直接关系的背景、扩展或周边功能"
    "不要拆成要点。逐个判断「实际回复」是否实质传达（不要求文字一致）：\n"
    "  - supported：实质传达\n"
    "  - missing：未提及\n"
    "  - contradicted：与该要点矛盾\n\n"
    "任务二【忠实性】：把「实际回复」拆成独立的事实性 claim"
    "（忽略客套话、过渡句和『参考：…』引用行；同类细节可合并成一条 claim，"
    "总数 ≤ 10），逐个判断「检索片段」中是否有依据：\n"
    "  - grounded：片段中有依据\n"
    "  - ungrounded：片段中无依据（外部知识或编造）\n\n"
    "point 和 claim 文本各 ≤ 30 字。输出 JSON（不要 markdown 代码块包裹）：\n"
    '{"nuggets": [{"point": "<要点>", "status": "supported|missing|contradicted"}],\n'
    ' "claims": [{"claim": "<事实>", "status": "grounded|ungrounded"}],\n'
    ' "reason": "<≤40字总评>"}'
)


async def _judge_answer(
    test: Dict[str, Any],
    answer: str,
    docs_block: str,
    judge_cfg: Dict[str, str],
) -> Dict[str, Any]:
    """nugget-level 要点覆盖 + claim-level 忠实性，一次 judge 调用完成。

    返回 dict：
      nugget_recall   supported / nuggets（0-1 连续分；nuggets 空时 None）
      contradicted    与参考答案矛盾的要点数
      faithfulness    grounded / claims（0-1；claims 空时 None）
      answer_correct  二值参考位：nugget_recall ≥ 0.6 且无 contradicted
      reason          judge 总评
      judge_error     解析失败时为 True（重试一次后仍失败）
    """
    from langchain_core.messages import HumanMessage, SystemMessage

    payload = (
        f"问题: {test['q']}\n\n"
        f"参考答案: {test.get('expected_answer','')}\n\n"
        f"检索片段:\n{docs_block}\n\n"
        f"实际回复:\n{answer}"
    )

    llm = _make_llm(judge_cfg, temperature=0.0, max_tokens=4096)
    for attempt in range(2):
        msg = await llm.ainvoke([SystemMessage(content=_JUDGE_PROMPT), HumanMessage(content=payload)])
        raw = (msg.content or "").strip() if hasattr(msg, "content") else str(msg)
        # 容错：剥掉 markdown 代码块包裹
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        try:
            start, end = raw.find("{"), raw.rfind("}")
            obj = json.loads(raw[start:end + 1])
            nuggets = [n for n in (obj.get("nuggets") or []) if n.get("status")]
            claims = [c for c in (obj.get("claims") or []) if c.get("status")]
            sup = sum(1 for n in nuggets if n["status"] == "supported")
            con = sum(1 for n in nuggets if n["status"] == "contradicted")
            grounded = sum(1 for c in claims if c["status"] == "grounded")
            nugget_recall = (sup / len(nuggets)) if nuggets else None
            faithfulness = (grounded / len(claims)) if claims else None
            return {
                "nugget_recall": nugget_recall,
                "nugget_total": len(nuggets),
                "nugget_supported": sup,
                "contradicted": con,
                "faithfulness": faithfulness,
                "claims_total": len(claims),
                "answer_correct": 1 if (nugget_recall is not None and nugget_recall >= 0.6 and con == 0) else 0,
                "reason": str(obj.get("reason", ""))[:120],
                "judge_error": False,
            }
        except Exception:
            if attempt == 0:
                continue
    return {
        "nugget_recall": None,
        "nugget_total": 0,
        "nugget_supported": 0,
        "contradicted": 0,
        "faithfulness": None,
        "claims_total": 0,
        "answer_correct": 0,
        "reason": f"judge parse failed: {raw[:80]}",
        "judge_error": True,
    }


# 通用拒答表述（与 must_say 求并集）：模型说"文档没写"的各种合理说法
_REFUSAL_PATTERNS = (
    "没找到", "没有找到", "未找到", "找不到",
    "没有说明", "未说明", "没有提到", "未提及", "没有相关", "无相关",
    "could not find", "no relevant", "not specify", "do not cover",
)


def _check_honest_refuse(test: Dict[str, Any], answer: str) -> int:
    """honest-negative：must_say 关键词或通用拒答表述命中任一即视为拒答成功。"""
    a = answer or ""
    keywords = list(test.get("must_say") or []) + list(_REFUSAL_PATTERNS)
    return 1 if any(k and k in a for k in keywords) else 0


def _check_must_not_say(test: Dict[str, Any], answer: str) -> bool:
    """must_not_say 命中即代表编造，返回 True 表示出现违禁词。"""
    a = answer or ""
    return any(k and k in a for k in (test.get("must_not_say") or []))


# ------------------ suite runner ------------------

async def run_suite(
    suite_path: str,
    top_k: int = 5,
    answerer_cfg: Optional[Dict[str, str]] = None,
    judge_cfg: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    with open(suite_path, "r", encoding="utf-8") as f:
        suite = yaml.safe_load(f)

    tests = suite.get("tests", []) or []
    results: List[Dict[str, Any]] = []

    # 端到端开启条件：同时配置 answerer 与 judge
    run_e2e = bool(answerer_cfg and judge_cfg)
    if run_e2e:
        logger.info(f"E2E enabled — answerer={answerer_cfg['model']}, judge={judge_cfg['model']}")

    for t in tests:
        r = await run_recall_one(t, top_k=top_k)

        if run_e2e:
            try:
                hits = r.get("hits", [])
                answer = await _answer_with_rag(t, hits, answerer_cfg)
                r["answer"] = answer

                if r["bucket"] == "honest-negative":
                    r["honest_refuse"] = _check_honest_refuse(t, answer)
                    r["answer_correct"] = r["honest_refuse"]  # 拒答 = 正确
                    r["violations"] = _check_must_not_say(t, answer)
                else:
                    verdict = await _judge_answer(t, answer, format_hits(hits), judge_cfg)
                    r["answer_correct"] = verdict["answer_correct"]
                    r["nugget_recall"] = verdict["nugget_recall"]
                    r["nugget_supported"] = verdict["nugget_supported"]
                    r["nugget_total"] = verdict["nugget_total"]
                    r["contradicted"] = verdict["contradicted"]
                    r["faithfulness"] = verdict["faithfulness"]
                    r["claims_total"] = verdict["claims_total"]
                    r["judge_error"] = verdict["judge_error"]
                    r["judge_reason"] = verdict["reason"]
                    r["violations"] = _check_must_not_say(t, answer)
            except Exception as e:
                logger.exception(f"E2E failed for {t['id']}")
                r["e2e_error"] = str(e)

        # 释放大字段
        r.pop("hits", None)
        results.append(r)

    # ---- aggregate ----
    scored = [r for r in results if r.get("recall_at_k") is not None]
    recall_hits = sum(r["recall_at_k"] for r in scored)
    recall_rate = recall_hits / len(scored) if scored else 0.0

    honest_total = sum(1 for r in results if r["bucket"] == "honest-negative")
    honest_pass = sum(1 for r in results if r.get("honest_refuse") == 1)

    e2e_scored = [r for r in results if "answer_correct" in r]
    answer_correct = sum(r["answer_correct"] for r in e2e_scored)
    violations = sum(1 for r in e2e_scored if r.get("violations"))

    # nugget / faithfulness 连续分（honest-negative 不参与；judge_error 排除并单独计数）
    nr_vals = [r["nugget_recall"] for r in e2e_scored if r.get("nugget_recall") is not None]
    faith_vals = [r["faithfulness"] for r in e2e_scored if r.get("faithfulness") is not None]
    judge_errors = sum(1 for r in e2e_scored if r.get("judge_error"))
    contradicted_questions = sum(1 for r in e2e_scored if r.get("contradicted"))

    by_bucket: Dict[str, Dict[str, int]] = {}
    for r in results:
        b = r["bucket"]
        d = by_bucket.setdefault(b, {"total": 0, "recall_hit": 0, "recall_scored": 0, "answer_hit": 0, "answer_scored": 0})
        d["total"] += 1
        if r.get("recall_at_k") is not None:
            d["recall_scored"] += 1
            d["recall_hit"] += r["recall_at_k"]
        if "answer_correct" in r:
            d["answer_scored"] += 1
            d["answer_hit"] += r["answer_correct"]

    return {
        "suite": suite_path,
        "total": len(tests),
        "recall_scored": len(scored),
        "recall_hits": recall_hits,
        "recall_rate": recall_rate,
        "honest_total": honest_total,
        "honest_pass": honest_pass,
        "honest_rate": (honest_pass / honest_total) if honest_total else None,
        "e2e_scored": len(e2e_scored),
        "answer_correct": answer_correct,
        "answer_rate": (answer_correct / len(e2e_scored)) if e2e_scored else None,
        "nugget_recall_avg": (sum(nr_vals) / len(nr_vals)) if nr_vals else None,
        "faithfulness_avg": (sum(faith_vals) / len(faith_vals)) if faith_vals else None,
        "judge_errors": judge_errors,
        "contradicted_questions": contradicted_questions,
        "violations": violations,
        "by_bucket": by_bucket,
        "results": results,
    }


def _print_report(report: Dict[str, Any], top_k: int) -> None:
    print(f"Suite: {report['suite']}")
    print(f"Total: {report['total']}, recall scored: {report['recall_scored']}")
    print(f"recall@{top_k}: {report['recall_hits']}/{report['recall_scored']} ({report['recall_rate']:.1%})")

    if report["honest_total"]:
        rate = report["honest_rate"]
        rate_s = "—" if rate is None else f"{rate:.0%}"
        print(f"honest_refuse: {report['honest_pass']}/{report['honest_total']} ({rate_s})")

    if report["e2e_scored"]:
        rate = report["answer_rate"]
        rate_s = "—" if rate is None else f"{rate:.1%}"
        print(f"answer_correct (binary 参考位): {report['answer_correct']}/{report['e2e_scored']} ({rate_s})")
        nr = report.get("nugget_recall_avg")
        print(f"nugget_recall (要点覆盖, 门槛 ≥0.75): {'—' if nr is None else f'{nr:.3f}'}")
        fa = report.get("faithfulness_avg")
        print(f"faithfulness (忠实性, 门槛 ≥0.85): {'—' if fa is None else f'{fa:.3f}'}")
        if report.get("contradicted_questions"):
            print(f"!! 含矛盾要点的题数: {report['contradicted_questions']}")
        if report.get("judge_errors"):
            print(f"!! judge 解析失败题数（已排除出均值）: {report['judge_errors']}")
        if report["violations"]:
            print(f"!! must_not_say violations: {report['violations']}")

    print()
    print("by bucket:")
    for b, d in sorted(report["by_bucket"].items()):
        rec = f"{d['recall_hit']}/{d['recall_scored']}" if d["recall_scored"] else "—"
        ans = f"{d['answer_hit']}/{d['answer_scored']}" if d["answer_scored"] else "—"
        print(f"  {b:18s}  total={d['total']:3d}  recall={rec:<8s}  answer={ans}")

    print()
    miss = [r for r in report["results"] if r.get("recall_at_k") == 0]
    if miss:
        print(f"RECALL MISS ({len(miss)}):")
        for r in miss:
            print(f"  {r['id']:6s}  expected={r['expected']}  got_top3={r['returned'][:3]}")

    wrong = [r for r in report["results"] if r.get("answer_correct") == 0 and r["bucket"] != "honest-negative"]
    if wrong:
        print(f"\nANSWER WRONG ({len(wrong)}):")
        for r in wrong:
            nr = r.get("nugget_recall")
            nr_s = "—" if nr is None else f"{nr:.2f}"
            print(f"  {r['id']:6s}  nugget={nr_s} contra={r.get('contradicted', 0)}  {r.get('judge_reason') or r.get('answer', '')[:70]!r}")


# ------------------ CLI ------------------

async def _main():
    parser = argparse.ArgumentParser(description="ai-kb eval")
    parser.add_argument("--suite", required=True, help="YAML 套件路径")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--json", action="store_true", help="输出原始 JSON")

    # answerer：用召回上下文给出 RAG 回复
    parser.add_argument("--answerer", help="answerer 模型名（如 gpt-4o-mini）；未指定则跳过 E2E")
    parser.add_argument("--answerer-base-url", help="answerer base_url（OpenAI 兼容）")
    parser.add_argument("--answerer-api-key", help="answerer api key")

    # judge：判定 answer 正确性
    parser.add_argument("--judge", help="judge 模型名（如 claude-3-5-sonnet）；未指定则跳过 E2E")
    parser.add_argument("--judge-base-url", help="judge base_url")
    parser.add_argument("--judge-api-key", help="judge api key")

    args = parser.parse_args()

    suite_path = args.suite
    if not os.path.isfile(suite_path):
        kb_root = os.environ.get("KB_CONTENT_DIR", "/app/kb-content")
        candidate = os.path.join(kb_root, "_eval", os.path.basename(suite_path))
        if os.path.isfile(candidate):
            suite_path = candidate
        else:
            print(f"suite not found: {suite_path}")
            sys.exit(2)

    # answerer = judge fallback：如果只给了 judge 一组凭证，用同一个跑两边
    answerer_cfg = None
    if args.answerer or os.environ.get("ANSWERER_MODEL"):
        answerer_cfg = {
            "model": args.answerer or os.environ.get("ANSWERER_MODEL"),
            "base_url": args.answerer_base_url or os.environ.get("ANSWERER_BASE_URL"),
            "api_key": args.answerer_api_key or os.environ.get("ANSWERER_API_KEY"),
        }
        if not answerer_cfg["api_key"]:
            answerer_cfg = None

    judge_cfg = _resolve_judge_config(args)

    # 单独给 judge 时复用为 answerer，反之亦然（同模型即可）
    if judge_cfg and not answerer_cfg:
        answerer_cfg = judge_cfg
    if answerer_cfg and not judge_cfg:
        judge_cfg = answerer_cfg

    report = await run_suite(suite_path, top_k=args.top_k, answerer_cfg=answerer_cfg, judge_cfg=judge_cfg)

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    _print_report(report, args.top_k)

    # DoD 守门：仅打印，不退出非 0（让 CI 自行决定阈值）
    print()
    print("--- DoD check (informational) ---")
    print(f"  recall@5  >= 85%: {'PASS' if report['recall_rate'] >= 0.85 else 'FAIL'}")
    if report["honest_total"]:
        print(f"  honest_refuse 100%: {'PASS' if report['honest_pass'] == report['honest_total'] else 'FAIL'}")
    if report["e2e_scored"]:
        ar = report["answer_rate"] or 0
        print(f"  answer_correct >= 80%: {'PASS' if ar >= 0.80 else 'FAIL'}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    asyncio.run(_main())
