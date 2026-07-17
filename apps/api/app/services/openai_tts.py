"""Synthesize OpenAI TTS audio with on-disk cache.

Cache key = SHA-256 of normalized text + model + voice + speed + format.
Audio files live under FLASHCARD_TTS_CACHE_DIR (or apps/api/app/data/openai_tts_cache).
Blobs are NOT stored in Postgres.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
from pathlib import Path

from app.core.openai_tts_config import (
    OPENAI_TTS_MAX_INPUT_CHARS,
    clamp_openai_tts_speed,
    get_openai_tts_model,
    is_openai_tts_enabled,
    normalize_openai_tts_voice,
    openai_tts_unavailable_reason,
)
from app.llm.direct_outbound import openai_client

logger = logging.getLogger(__name__)

_RESPONSE_FORMAT = "mp3"
_CACHE_DIR = Path(
    os.environ.get("FLASHCARD_TTS_CACHE_DIR", "")
    or (Path(__file__).resolve().parent.parent / "data" / "openai_tts_cache")
)
_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Calm educational tone (same spirit as Planlet's NEUTRAL_EDUCATIONAL default).
_DEFAULT_INSTRUCTIONS = (
    "Read in a calm, natural, intelligent educational tone. Use clear pacing and "
    "thoughtful emphasis. Avoid sounding theatrical, promotional, overly cheerful, or robotic."
)
_FARSI_APPENDIX = (
    " For Persian (Farsi) content: preserve the original language and pronunciation. "
    "Do not read Persian as Arabic. Keep names and non-English phrases natural."
)


class OpenAiTtsError(Exception):
    """Raised for configuration / validation / upstream TTS failures."""

    def __init__(self, code: str, message: str, *, http_status: int = 502):
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status


def _normalize_text_for_cache(text: str) -> str:
    # Collapse runs of whitespace so trivial formatting diffs share a cache entry.
    return re.sub(r"\s+", " ", (text or "").strip())


def cache_key_for(*, text: str, model: str, voice: str, speed: float) -> str:
    payload = "\n".join(
        [
            _normalize_text_for_cache(text),
            model.strip(),
            voice.strip().lower(),
            f"{clamp_openai_tts_speed(speed):.2f}",
            _RESPONSE_FORMAT,
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cache_path(key: str) -> Path:
    return _CACHE_DIR / f"{key}.mp3"


def _build_instructions(language: str | None) -> str:
    lang = (language or "").strip().lower()
    if lang.startswith("fa") or lang in ("farsi", "persian"):
        return _DEFAULT_INSTRUCTIONS + _FARSI_APPENDIX
    return _DEFAULT_INSTRUCTIONS


def synthesize_openai_tts(
    *,
    text: str,
    voice: str | None = None,
    speed: float | None = None,
    language: str | None = None,
) -> tuple[bytes, dict]:
    """
    Return (mp3_bytes, meta) where meta includes model, voice, speed, cache hit flag.

    Raises OpenAiTtsError on config / validation / upstream failures.
    """
    reason = openai_tts_unavailable_reason()
    if reason == "feature_disabled":
        raise OpenAiTtsError(
            "feature_disabled",
            "OpenAI voice is disabled on this server.",
            http_status=503,
        )
    if reason == "missing_api_key" or not is_openai_tts_enabled():
        raise OpenAiTtsError(
            "configuration_missing",
            "OpenAI voice is not configured.",
            http_status=503,
        )

    trimmed = (text or "").strip()
    if not trimmed:
        raise OpenAiTtsError("empty_text", "Text is empty.", http_status=400)
    if len(trimmed) > OPENAI_TTS_MAX_INPUT_CHARS:
        raise OpenAiTtsError(
            "request_too_large",
            f"Text exceeds the {OPENAI_TTS_MAX_INPUT_CHARS}-character limit.",
            http_status=400,
        )

    model = get_openai_tts_model()
    resolved_voice = normalize_openai_tts_voice(voice)
    resolved_speed = clamp_openai_tts_speed(speed)
    key = cache_key_for(
        text=trimmed, model=model, voice=resolved_voice, speed=resolved_speed
    )
    path = _cache_path(key)

    if path.is_file() and path.stat().st_size > 0:
        audio = path.read_bytes()
        return audio, {
            "model": model,
            "voice": resolved_voice,
            "speed": resolved_speed,
            "cache": "hit",
            "cache_key": key,
            "input_characters": len(trimmed),
        }

    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    client = openai_client(api_key)
    instructions = _build_instructions(language)

    try:
        # gpt-4o-mini-tts accepts instructions; speed is supported on speech.create.
        response = client.audio.speech.create(
            model=model,
            voice=resolved_voice,
            input=trimmed,
            instructions=instructions,
            response_format=_RESPONSE_FORMAT,
            speed=resolved_speed,
        )
        audio = response.content if hasattr(response, "content") else bytes(response.read())
    except Exception as exc:  # noqa: BLE001 - map broadly for user-facing codes
        msg = str(exc) or "OpenAI speech request failed."
        lower = msg.lower()
        status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
        if status == 401 or "incorrect api key" in lower or "invalid_api_key" in lower:
            raise OpenAiTtsError(
                "authentication_failed",
                "OpenAI authentication failed.",
                http_status=503,
            ) from exc
        if status == 429 or "rate limit" in lower:
            raise OpenAiTtsError(
                "rate_limited",
                "OpenAI rate limit reached. Try again shortly.",
                http_status=503,
            ) from exc
        if "insufficient_quota" in lower or "quota" in lower:
            raise OpenAiTtsError(
                "insufficient_quota",
                "OpenAI quota exceeded.",
                http_status=503,
            ) from exc
        logger.exception("OpenAI TTS synthesis failed")
        raise OpenAiTtsError("upstream_error", msg, http_status=502) from exc

    if not audio:
        raise OpenAiTtsError(
            "upstream_error",
            "OpenAI returned empty audio.",
            http_status=502,
        )

    try:
        path.write_bytes(audio)
        cache_write = "ok"
    except OSError:
        logger.warning("Failed to write OpenAI TTS cache file %s", path, exc_info=True)
        cache_write = "failed"

    return audio, {
        "model": model,
        "voice": resolved_voice,
        "speed": resolved_speed,
        "cache": "miss",
        "cache_write": cache_write,
        "cache_key": key,
        "input_characters": len(trimmed),
    }
