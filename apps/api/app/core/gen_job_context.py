"""
Per-request generation job id (async context) and thread-local LLM stats during card prep.

Used for compact, scannable lifecycle logs. TLS stats only update while card prep is armed
(same thread as _sync_prepare_generated_cards), not during source-summary LLM calls.

Card prep records every successful completion (per chunk / attempt); snapshot exposes
``cards_provider_final`` (majority provider) so outcome logs are not skewed by the
last completion only (e.g. Groq on the final chunk after mostly Gemini).
"""
from __future__ import annotations

import contextvars
import threading
from typing import Any

generation_job_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "generation_job_id", default=None
)

_tls = threading.local()


def llm_prep_stats_arm(armed: bool) -> None:
    _tls.prep_armed = armed


def llm_prep_stats_armed() -> bool:
    return bool(getattr(_tls, "prep_armed", False))


def llm_prep_stats_reset() -> None:
    _tls.prep = {
        "last_provider": None,
        "any_fallback": False,
        "cards_success_counts": {},
        "cards_success_order": [],
    }
    grounding_stats_reset()


def grounding_stats_reset() -> None:
    """Reset per-job grounding verifier counters (same thread / arm scope as card prep)."""
    _tls.grounding = {
        "calls": 0,
        "total_ms": 0,
        "changed_count": 0,
        "all_removed_count": 0,
        "fallback_count": 0,
        "noop_count": 0,
    }


def grounding_stats_record_pass(
    elapsed_ms: int,
    *,
    before_count: int,
    after_verifier: int | None,
    returned_count: int,
    fallback_used: bool,
    reason: str,
    materially_changed: bool,
) -> None:
    """Accumulate stats for one aux/grounding LLM pass (text strict mode)."""
    if not llm_prep_stats_armed():
        return
    g = getattr(_tls, "grounding", None)
    if g is None:
        grounding_stats_reset()
        g = _tls.grounding
    g["calls"] = int(g["calls"]) + 1
    g["total_ms"] = int(g["total_ms"]) + max(0, int(elapsed_ms))
    if fallback_used:
        g["fallback_count"] = int(g["fallback_count"]) + 1
    if reason == "all_removed":
        g["all_removed_count"] = int(g["all_removed_count"]) + 1
    if materially_changed:
        g["changed_count"] = int(g["changed_count"]) + 1
    if (
        not fallback_used
        and after_verifier is not None
        and after_verifier == before_count
    ):
        g["noop_count"] = int(g["noop_count"]) + 1


def grounding_stats_snapshot() -> dict[str, Any]:
    g = getattr(_tls, "grounding", None)
    if not g:
        return {
            "calls": 0,
            "total_ms": 0,
            "changed_count": 0,
            "all_removed_count": 0,
            "fallback_count": 0,
            "noop_count": 0,
        }
    return {
        "calls": int(g.get("calls") or 0),
        "total_ms": int(g.get("total_ms") or 0),
        "changed_count": int(g.get("changed_count") or 0),
        "all_removed_count": int(g.get("all_removed_count") or 0),
        "fallback_count": int(g.get("fallback_count") or 0),
        "noop_count": int(g.get("noop_count") or 0),
    }


def _cards_provider_final(counts: dict[str, int], order: list[str]) -> str | None:
    """Provider that produced the most successful card-prep completions; tie → earliest such in time order."""
    if not counts:
        return None
    max_n = max(counts.values())
    candidates = [pr for pr, n in counts.items() if n == max_n]
    if len(candidates) == 1:
        return candidates[0]
    for pr in order:
        if pr in candidates:
            return pr
    return candidates[0]


def llm_prep_stats_record_success(provider: str, chain_pos: int) -> None:
    if not llm_prep_stats_armed():
        return
    p = getattr(_tls, "prep", None)
    if p is None:
        p = {}
        _tls.prep = p
    p["last_provider"] = provider
    if chain_pos > 0:
        p["any_fallback"] = True
    cnt: dict[str, int] = p.setdefault("cards_success_counts", {})
    cnt[provider] = int(cnt.get(provider, 0)) + 1
    order: list[str] = p.setdefault("cards_success_order", [])
    order.append(provider)


def llm_prep_stats_snapshot() -> dict[str, Any]:
    p = getattr(_tls, "prep", None)
    if not p:
        return {
            "last_provider": None,
            "cards_provider_final": None,
            "cards_provider_mix": "",
            "any_fallback": False,
        }
    counts: dict[str, int] = dict(p.get("cards_success_counts") or {})
    order: list[str] = list(p.get("cards_success_order") or [])
    final = _cards_provider_final(counts, order)
    mix = ",".join(f"{k}:{counts[k]}" for k in sorted(counts)) if counts else ""
    return {
        "last_provider": p.get("last_provider"),
        "cards_provider_final": final,
        "cards_provider_mix": mix,
        "any_fallback": bool(p.get("any_fallback")),
    }
