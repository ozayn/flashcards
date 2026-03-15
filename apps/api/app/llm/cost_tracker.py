"""
Lightweight LLM cost tracking.
Logs token usage and estimated API costs.
Set LLM_COST_TRACKING=0 to disable.
"""
from __future__ import annotations

import os

MODEL_COSTS = {
    "llama-3.1-8b-instant": {
        "input": 0.05 / 1_000_000,
        "output": 0.08 / 1_000_000,
    },
    "llama-3.1-70b-versatile": {
        "input": 0.59 / 1_000_000,
        "output": 0.79 / 1_000_000,
    },
    "gpt-4o-mini": {
        "input": 0.15 / 1_000_000,
        "output": 0.60 / 1_000_000,
    },
    "deepseek/deepseek-chat": {
        "input": 0.14 / 1_000_000,
        "output": 0.28 / 1_000_000,
    },
    "gemini-2.5-flash": {
        "input": 0.075 / 1_000_000,
        "output": 0.30 / 1_000_000,
    },
}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Compute estimated cost from token counts. Returns 0.0 for unknown models."""
    costs = MODEL_COSTS.get(model)
    if not costs:
        return 0.0
    input_cost = input_tokens * costs["input"]
    output_cost = output_tokens * costs["output"]
    return input_cost + output_cost


def _is_tracking_enabled() -> bool:
    val = (os.getenv("LLM_COST_TRACKING", "1") or "1").strip().lower()
    return val not in ("0", "false", "no", "off")


def log_llm_usage(
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
) -> None:
    """Log LLM usage and estimated cost. Never raises."""
    if not _is_tracking_enabled():
        return
    total_tokens = input_tokens + output_tokens
    cost = estimate_cost(model, input_tokens, output_tokens)
    print(
        "LLM Usage\n"
        "---------\n"
        f"Provider: {provider}\n"
        f"Model: {model}\n"
        f"Input tokens: {input_tokens}\n"
        f"Output tokens: {output_tokens}\n"
        f"Total tokens: {total_tokens}\n"
        f"Estimated cost: ${cost:.5f}\n"
    )


def log_usage_unavailable(provider: str) -> None:
    """Log when token usage cannot be extracted. Never raises."""
    if not _is_tracking_enabled():
        return
    print(f"Token usage unavailable for {provider}.")
