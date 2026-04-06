"""
Gemini-first vs Groq-first ordering for heavy text/transcript LLM jobs.

Tunable via env (see long_text_threshold and related helpers).
YouTube decks with a non-empty text body always prefer Gemini first (see should_prefer_gemini_first).
"""
from __future__ import annotations

import os


def long_text_threshold_chars() -> int:
    """Aligns with GENERATION_TEXT_CHUNK_THRESHOLD in generation.py (default 12000)."""
    raw = (os.environ.get("GENERATION_TEXT_CHUNK_THRESHOLD") or "").strip()
    if raw:
        try:
            return max(4000, min(int(raw), 50000))
        except ValueError:
            pass
    return 12000


def high_cards_threshold() -> int:
    """With a long source, prefer Gemini when requested card count is at or above this."""
    raw = (os.environ.get("GENERATION_GEMINI_FIRST_HIGH_CARDS") or "").strip()
    if raw:
        try:
            return max(5, min(int(raw), 50))
        except ValueError:
            pass
    return 22


def high_cards_min_text_chars() -> int:
    """Minimum source length for the high-cards rule."""
    raw = (os.environ.get("GENERATION_GEMINI_FIRST_HIGH_CARDS_MIN_TEXT") or "").strip()
    if raw:
        try:
            return max(4000, min(int(raw), 50000))
        except ValueError:
            pass
    return 10000


def should_prefer_gemini_first(routing: dict) -> tuple[bool, str]:
    """
    Decide if Gemini should be tried before Groq for this text job.
    routing keys: chunked_mode (bool), text_len (int), source_type (str|None), num_cards (int|None),
    optional youtube_route_reason: "youtube_transcript" | "youtube_text" (log label only).
    Returns (prefer_gemini, reason_token) — reason is for logs only.
    """
    if routing.get("chunked_mode"):
        return True, "chunked_text"

    tl = int(routing.get("text_len") or 0)
    st = (routing.get("source_type") or "").strip().lower()
    # YouTube + any non-empty passage: Gemini first even below chunk / long-text thresholds
    # (avoids long Groq rate-limit backoff on medium single-chunk transcript jobs).
    if st == "youtube" and tl > 0:
        rr = (routing.get("youtube_route_reason") or "youtube_transcript").strip().lower()
        if rr not in ("youtube_transcript", "youtube_text"):
            rr = "youtube_transcript"
        return True, rr

    thr = long_text_threshold_chars()
    if tl >= thr:
        return True, "long_text"

    nc = routing.get("num_cards")
    if nc is not None and tl >= high_cards_min_text_chars() and int(nc) >= high_cards_threshold():
        return True, "long_source_high_cards"

    return False, "short_text"


def reorder_groq_gemini(order: list[str], *, gemini_first: bool) -> list[str]:
    """Place groq and gemini adjacent in the list; optionally put gemini before groq. Other providers keep relative order."""
    out = list(order)
    try:
        ig = out.index("groq")
        im = out.index("gemini")
    except ValueError:
        return out
    # Remove from higher index first so indices stay valid
    for i in sorted([ig, im], reverse=True):
        out.pop(i)
    insert_at = min(ig, im)
    pair = ["gemini", "groq"] if gemini_first else ["groq", "gemini"]
    for j, p in enumerate(pair):
        out.insert(insert_at + j, p)
    return out


def apply_provider_routing(
    base_order: list[str], llm_routing: dict | None
) -> tuple[list[str], str, str]:
    """
    Returns (order, provider_route_label, reason).
    provider_route_label is gemini_first or groq_first for logging.
    """
    if not llm_routing:
        return list(base_order), "groq_first", "default"
    prefer, reason = should_prefer_gemini_first(llm_routing)
    routed = reorder_groq_gemini(base_order, gemini_first=prefer)
    label = "gemini_first" if prefer else "groq_first"
    return routed, label, reason
