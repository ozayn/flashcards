"""OpenAI text-to-speech endpoint for MemoNext read-aloud.

POST /speech/openai — authenticated, returns audio/mpeg (buffered MP3, Planlet-style).
GET  /speech/openai/status — whether OpenAI TTS is configured (no secrets leaked).
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.guest_trial import is_guest_trial_user_id
from app.core.openai_tts_config import (
    OPENAI_TTS_MAX_INPUT_CHARS,
    OPENAI_TTS_RATE_LIMIT_PER_MINUTE,
    OPENAI_TTS_VOICES,
    get_openai_tts_default_voice,
    get_openai_tts_model,
    is_openai_tts_enabled,
    openai_tts_unavailable_reason,
)
from app.core.user_access import get_trusted_acting_user_id
from app.services.openai_tts import OpenAiTtsError, synthesize_openai_tts
from app.utils.tts_rate_limit import check_sliding_window_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/speech", tags=["speech"])


class OpenAiSpeechRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=OPENAI_TTS_MAX_INPUT_CHARS)
    voice: Optional[str] = Field(
        default=None,
        description=f"One of: {', '.join(OPENAI_TTS_VOICES)}",
    )
    speed: float = Field(default=1.0, ge=0.25, le=4.0)
    language: Optional[str] = Field(
        default=None,
        description="BCP-47-ish hint (e.g. en, fa). Affects TTS instructions only.",
        max_length=16,
    )


class OpenAiSpeechStatusResponse(BaseModel):
    available: bool
    reason: Optional[str] = None
    model: str
    default_voice: str
    voices: list[str]
    max_input_chars: int
    # Scaffolding for a future paid-plan gate (not enforced in v1 beyond sign-in).
    requires_sign_in: bool = True
    paid_plan_required: bool = False


def _require_signed_in_user(trusted_id: Optional[str]) -> str:
    if not trusted_id or not trusted_id.strip():
        raise HTTPException(
            status_code=401,
            detail="Sign in to use OpenAI voice.",
        )
    if is_guest_trial_user_id(trusted_id):
        raise HTTPException(
            status_code=401,
            detail="Sign in to use OpenAI voice.",
        )
    return trusted_id.strip()


@router.get("/openai/status", response_model=OpenAiSpeechStatusResponse)
async def openai_speech_status(
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Public-ish status for the Profile UI (no API key leakage)."""
    reason = openai_tts_unavailable_reason()
    return OpenAiSpeechStatusResponse(
        available=is_openai_tts_enabled(),
        reason=reason,
        model=get_openai_tts_model(),
        default_voice=get_openai_tts_default_voice(),
        voices=list(OPENAI_TTS_VOICES),
        max_input_chars=OPENAI_TTS_MAX_INPUT_CHARS,
        requires_sign_in=True,
        paid_plan_required=False,
    )


@router.post("/openai")
async def openai_speech(
    payload: OpenAiSpeechRequest,
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Synthesize MP3 audio for the given text via OpenAI TTS.

    Auth: requires a signed-in OAuth user (HMAC acting-user headers from the Next.js proxy).
    Guest trial accounts are rejected. Response body is raw audio/mpeg.
    """
    # db reserved for a future per-user / plan.pro feature gate.
    _ = db
    user_id = _require_signed_in_user(trusted_id)

    if not check_sliding_window_rate_limit(
        f"openai-tts:{user_id}",
        max_hits=OPENAI_TTS_RATE_LIMIT_PER_MINUTE,
        window_seconds=60.0,
    ):
        raise HTTPException(
            status_code=429,
            detail="Too many OpenAI voice requests. Please wait a moment.",
        )

    try:
        audio, meta = synthesize_openai_tts(
            text=payload.text,
            voice=payload.voice,
            speed=payload.speed,
            language=payload.language,
        )
    except OpenAiTtsError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc

    headers = {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
        "X-Memo-Tts-Cache": str(meta.get("cache", "miss")),
        "X-Memo-Tts-Model": str(meta.get("model", "")),
        "X-Memo-Tts-Voice": str(meta.get("voice", "")),
        "X-Memo-Tts-Speed": f"{float(meta.get('speed', 1.0)):.2f}",
    }
    return Response(content=audio, media_type="audio/mpeg", headers=headers)
