"""OpenAI TTS configuration (env-backed), shared by the speech router and synthesizer.

Mirrors Planlet's getOpenAiTtsModel / getOpenAiTtsVoice / enable-flag pattern, adapted
for MemoNext's FastAPI stack. OPENAI_API_KEY is never exposed to the frontend.
"""

from __future__ import annotations

import os
from typing import Literal

# Curated v1 set (subset of OpenAI's catalog). Keep in sync with the web curated list.
OPENAI_TTS_VOICES = (
    "fable",
    "shimmer",
    "marin",
    "coral",
    "nova",
    "alloy",
    "echo",
    "sage",
)

DEFAULT_OPENAI_TTS_MODEL = "gpt-4o-mini-tts"
DEFAULT_OPENAI_TTS_VOICE = "fable"
# OpenAI speech.create input hard cap is 4096; stay under for safety.
OPENAI_TTS_MAX_INPUT_CHARS = 3500
# Soft rate limit: requests per user per rolling window.
OPENAI_TTS_RATE_LIMIT_PER_MINUTE = 30

OpenAiTtsUnavailableReason = Literal[
    "missing_api_key",
    "feature_disabled",
]


def get_openai_tts_model() -> str:
    return (os.environ.get("OPENAI_TTS_MODEL") or "").strip() or DEFAULT_OPENAI_TTS_MODEL


def get_openai_tts_default_voice() -> str:
    """Server default / env fallback. UI default for new preferences is still `fable`."""
    raw = (os.environ.get("OPENAI_TTS_DEFAULT_VOICE") or os.environ.get("OPENAI_TTS_VOICE") or "").strip()
    if raw in OPENAI_TTS_VOICES:
        return raw
    return DEFAULT_OPENAI_TTS_VOICE


def is_openai_tts_enabled() -> bool:
    """
    Enabled when OPENAI_API_KEY is set, unless OPENAI_TTS_ENABLED is explicitly off.

    OPENAI_TTS_ENABLED=0|false|off|no → disabled even if a key is present.
    OPENAI_TTS_ENABLED unset/true → enabled iff OPENAI_API_KEY is non-empty.
    """
    flag = (os.environ.get("OPENAI_TTS_ENABLED") or "").strip().lower()
    if flag in ("0", "false", "off", "no"):
        return False
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    return bool(key)


def openai_tts_unavailable_reason() -> OpenAiTtsUnavailableReason | None:
    if not is_openai_tts_enabled():
        flag = (os.environ.get("OPENAI_TTS_ENABLED") or "").strip().lower()
        if flag in ("0", "false", "off", "no"):
            return "feature_disabled"
        return "missing_api_key"
    return None


def normalize_openai_tts_voice(raw: str | None) -> str:
    v = (raw or "").strip().lower()
    if v in OPENAI_TTS_VOICES:
        return v
    return get_openai_tts_default_voice()


def clamp_openai_tts_speed(raw: float | None) -> float:
    """OpenAI accepts 0.25–4.0; default 1.0. v1 UI does not expose speed."""
    if raw is None:
        return 1.0
    try:
        s = float(raw)
    except (TypeError, ValueError):
        return 1.0
    return max(0.25, min(4.0, s))
