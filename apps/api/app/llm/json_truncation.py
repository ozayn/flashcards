"""Heuristics for truncated / incomplete JSON from LLM responses (logging + retry triggers)."""

from __future__ import annotations

import json
import re


def _strip_json_fence(raw: str) -> str:
    s = raw.strip()
    if s.startswith("```"):
        m = re.search(r"```(?:json|JSON)?\s*([\s\S]*?)```", s)
        if m:
            return m.group(1).strip()
        s = re.sub(r"^```\w*\s*\n?", "", s)
        s = re.sub(r"\n?```\s*$", "", s).strip()
    return s


def analyze_llm_json_response(text: str) -> tuple[bool, str]:
    """
    Detect whether text looks like JSON that was cut off (vs unrelated malformed JSON).

    Returns:
        (likely_truncated, reason) — reason is a short machine-readable tag for logs.
    """
    if not text or not str(text).strip():
        return False, "empty"

    raw = _strip_json_fence(str(text))
    if not raw:
        return False, "empty_after_fence"

    try:
        json.loads(raw)
        return False, "parse_ok"
    except json.JSONDecodeError:
        pass

    if not (raw.startswith("{") or raw.startswith("[")):
        return False, "not_json_like"

    in_str = False
    escape = False
    stack: list[str] = []

    for c in raw:
        if escape:
            escape = False
            continue
        if in_str:
            if c == "\\":
                escape = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
            continue
        if c in "{[":
            stack.append(c)
        elif c in "}]":
            if stack:
                stack.pop()

    if in_str:
        return True, "unclosed_string"

    if stack:
        return True, "unclosed_brackets"

    tail = raw.rstrip()
    if tail.endswith((",", ":", "[", "{")):
        return True, "ends_incomplete_delim"

    # Still invalid JSON but braces/strings closed — likely typo, not truncation
    return False, "malformed_not_truncation"


def finish_reason_is_max_tokens(finish: str | None) -> bool:
    """True if provider finishReason indicates output length limit."""
    if not finish:
        return False
    u = str(finish).upper().replace("-", "_")
    return "MAX_TOKENS" in u or u == "LENGTH" or "OUT_OF_TOKENS" in u
