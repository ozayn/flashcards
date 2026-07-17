"""Synthesize OpenAI TTS audio with durable on-disk cache.

See ``openai_tts_cache`` for key composition, sidecar metadata, cleanup, and
single-flight locking. Blobs are NOT stored in Postgres.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

from app.core.openai_tts_config import (
    OPENAI_TTS_MAX_INPUT_CHARS,
    build_openai_tts_instructions,
    clamp_openai_tts_speed,
    get_openai_tts_model,
    is_openai_tts_enabled,
    normalize_openai_tts_voice,
    openai_tts_unavailable_reason,
)
from app.llm.direct_outbound import openai_client
from app.services.openai_tts_cache import (
    OPENAI_TTS_PREPROCESSING_VERSION,
    cache_key_for,
    get_or_generate_cached_audio,
    instructions_fingerprint,
    normalize_language_for_tts_cache,
    write_cached_audio,
)

logger = logging.getLogger(__name__)

# Re-export for callers/tests that imported from this module.
__all__ = [
    "OpenAiTtsError",
    "cache_key_for",
    "synthesize_openai_tts",
    "OPENAI_TTS_PREPROCESSING_VERSION",
]


class OpenAiTtsError(Exception):
    """Raised for configuration / validation / upstream TTS failures."""

    def __init__(self, code: str, message: str, *, http_status: int = 502):
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status


def synthesize_openai_tts(
    *,
    text: str,
    voice: str | None = None,
    speed: float | None = None,
    language: str | None = None,
) -> tuple[bytes, dict[str, Any]]:
    """
    Return (mp3_bytes, meta) where meta includes model, voice, speed, cache hit flag,
    and openai_latency_ms on misses.
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
    lang = normalize_language_for_tts_cache(language)
    instructions = build_openai_tts_instructions(language)
    instr_fp = instructions_fingerprint(instructions)
    key = cache_key_for(
        text=trimmed,
        model=model,
        voice=resolved_voice,
        speed=resolved_speed,
        instructions=instructions,
        language=lang,
        preprocessing_version=OPENAI_TTS_PREPROCESSING_VERSION,
    )

    def _generate() -> tuple[bytes, dict[str, Any]]:
        api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
        client = openai_client(api_key)
        t0 = time.perf_counter()
        try:
            response = client.audio.speech.create(
                model=model,
                voice=resolved_voice,
                input=trimmed,
                instructions=instructions,
                response_format="mp3",
                speed=resolved_speed,
            )
            audio = (
                response.content
                if hasattr(response, "content")
                else bytes(response.read())
            )
        except Exception as exc:  # noqa: BLE001
            msg = str(exc) or "OpenAI speech request failed."
            lower = msg.lower()
            status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
            err_type = type(exc).__name__
            safe_msg = msg.replace("\n", " ")[:240]

            if status == 401 or "incorrect api key" in lower or "invalid_api_key" in lower:
                logger.error(
                    "openai_tts_upstream auth_failed status=%s type=%s detail=%s",
                    status,
                    err_type,
                    safe_msg,
                )
                raise OpenAiTtsError(
                    "authentication_failed",
                    "OpenAI authentication failed. Check OPENAI_API_KEY on the API service.",
                    http_status=502,
                ) from exc
            if status == 429 or "rate limit" in lower:
                logger.warning(
                    "openai_tts_upstream rate_limited status=%s type=%s",
                    status,
                    err_type,
                )
                raise OpenAiTtsError(
                    "rate_limited",
                    "OpenAI rate limit reached. Try again shortly.",
                    http_status=502,
                ) from exc
            if "insufficient_quota" in lower or (
                "quota" in lower and status in (429, 402, None)
            ):
                logger.error(
                    "openai_tts_upstream insufficient_quota status=%s type=%s",
                    status,
                    err_type,
                )
                raise OpenAiTtsError(
                    "insufficient_quota",
                    "OpenAI quota exceeded.",
                    http_status=502,
                ) from exc
            logger.exception(
                "openai_tts_upstream failed status=%s type=%s detail=%s",
                status,
                err_type,
                safe_msg,
            )
            raise OpenAiTtsError(
                "upstream_error",
                "OpenAI voice request failed. Please try again.",
                http_status=502,
            ) from exc

        latency_ms = int((time.perf_counter() - t0) * 1000)
        if not audio:
            raise OpenAiTtsError(
                "upstream_error",
                "OpenAI returned empty audio.",
                http_status=502,
            )

        write_meta = write_cached_audio(
            key,
            audio,
            model=model,
            voice=resolved_voice,
            speed=resolved_speed,
            language=lang,
            instructions_fingerprint=instr_fp,
            preprocessing_version=OPENAI_TTS_PREPROCESSING_VERSION,
        )
        return audio, {
            "model": model,
            "voice": resolved_voice,
            "speed": resolved_speed,
            "language": lang,
            "cache": "miss",
            "cache_write": write_meta.get("cache_write", "ok"),
            "cache_key": key,
            "byte_size": len(audio),
            "input_characters": len(trimmed),
            "openai_latency_ms": latency_ms,
            "preprocessing_version": OPENAI_TTS_PREPROCESSING_VERSION,
        }

    audio, meta = get_or_generate_cached_audio(key, _generate)
    # Ensure consistent response shape on hits.
    meta.setdefault("model", model)
    meta.setdefault("voice", resolved_voice)
    meta.setdefault("speed", resolved_speed)
    meta.setdefault("language", lang)
    meta.setdefault("byte_size", len(audio))
    meta.setdefault("input_characters", len(trimmed))
    meta.setdefault("preprocessing_version", OPENAI_TTS_PREPROCESSING_VERSION)
    return audio, meta
