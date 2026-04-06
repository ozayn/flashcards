"""
Per-request generation job id (async context) and thread-local LLM stats during card prep.

Used for compact, scannable lifecycle logs. TLS stats only update while card prep is armed
(same thread as _sync_prepare_generated_cards), not during source-summary LLM calls.
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
    _tls.prep = {"last_provider": None, "any_fallback": False}


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


def llm_prep_stats_snapshot() -> dict[str, Any]:
    p = getattr(_tls, "prep", None)
    if not p:
        return {"last_provider": None, "any_fallback": False}
    return {"last_provider": p.get("last_provider"), "any_fallback": bool(p.get("any_fallback"))}
