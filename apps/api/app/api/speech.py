"""OpenAI text-to-speech endpoint for MemoNext read-aloud.

POST /speech/openai — product-admin only; returns audio/mpeg.
GET  /speech/openai/status — whether OpenAI TTS is configured + caller may use it.
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
    openai_api_key_configured,
    openai_tts_unavailable_reason,
)
from app.core.product_admin import user_has_product_admin_access
from app.core.user_access import fetch_user, get_trusted_acting_user_id
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
    requires_sign_in: bool = True
    requires_product_admin: bool = True
    # True when the current acting user is a product admin (False if signed out).
    caller_is_product_admin: bool = False
    # Convenience: configured AND this caller may use it.
    available_for_caller: bool = False
    paid_plan_required: bool = False


async def _require_product_admin_user(
    db: AsyncSession,
    trusted_id: Optional[str],
):
    """
    Auth for OpenAI TTS:
    - 401 if missing/guest acting user
    - 403 if signed in but not a product admin (not ALLOWED_LOGIN_EMAILS)
    """
    if not trusted_id or not trusted_id.strip():
        raise HTTPException(status_code=401, detail="Sign in to use OpenAI voice.")
    if is_guest_trial_user_id(trusted_id):
        raise HTTPException(status_code=401, detail="Sign in to use OpenAI voice.")
    user = await fetch_user(db, trusted_id.strip())
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to use OpenAI voice.")
    is_admin = user_has_product_admin_access(user)
    if not is_admin:
        logger.info(
            "openai_tts_denied user_id=%s email=%s product_admin=False",
            user.id,
            (user.email or "")[:80],
        )
        raise HTTPException(
            status_code=403,
            detail="OpenAI voice is only available to product admins.",
        )
    return user


@router.get("/openai/status", response_model=OpenAiSpeechStatusResponse)
async def openai_speech_status(
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Status for the Profile UI (no secrets). Includes whether this caller may use OpenAI TTS."""
    reason = openai_tts_unavailable_reason()
    configured = is_openai_tts_enabled()
    caller_is_admin = False
    if trusted_id and not is_guest_trial_user_id(trusted_id):
        user = await fetch_user(db, trusted_id.strip())
        caller_is_admin = user_has_product_admin_access(user)

    return OpenAiSpeechStatusResponse(
        available=configured,
        reason=reason,
        model=get_openai_tts_model(),
        default_voice=get_openai_tts_default_voice(),
        voices=list(OPENAI_TTS_VOICES),
        max_input_chars=OPENAI_TTS_MAX_INPUT_CHARS,
        requires_sign_in=True,
        requires_product_admin=True,
        caller_is_product_admin=caller_is_admin,
        available_for_caller=configured and caller_is_admin,
        paid_plan_required=False,
    )


@router.post("/openai")
async def openai_speech(
    payload: OpenAiSpeechRequest,
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Synthesize MP3 via OpenAI TTS.

    Requires a signed-in product admin. Guest trial and regular users are rejected.
    """
    user = await _require_product_admin_user(db, trusted_id)
    user_id = user.id
    email = (user.email or "")[:80]

    if not check_sliding_window_rate_limit(
        f"openai-tts:{user_id}",
        max_hits=OPENAI_TTS_RATE_LIMIT_PER_MINUTE,
        window_seconds=60.0,
    ):
        raise HTTPException(
            status_code=429,
            detail="Too many OpenAI voice requests. Please wait a moment.",
        )

    model = get_openai_tts_model()
    voice = (payload.voice or get_openai_tts_default_voice()).strip().lower()
    logger.info(
        "openai_tts_request user_id=%s email=%s product_admin=True "
        "model=%s voice=%s speed=%.2f lang=%s text_len=%s api_key_configured=%s",
        user_id,
        email,
        model,
        voice,
        float(payload.speed),
        (payload.language or "")[:16],
        len((payload.text or "").strip()),
        openai_api_key_configured(),
    )

    try:
        audio, meta = synthesize_openai_tts(
            text=payload.text,
            voice=payload.voice,
            speed=payload.speed,
            language=payload.language,
        )
    except OpenAiTtsError as exc:
        logger.warning(
            "openai_tts_failed user_id=%s email=%s product_admin=True "
            "model=%s voice=%s code=%s http_status=%s api_key_configured=%s",
            user_id,
            email,
            model,
            voice,
            exc.code,
            exc.http_status,
            openai_api_key_configured(),
        )
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc

    logger.info(
        "openai_tts_ok user_id=%s cache=%s model=%s voice=%s bytes=%s",
        user_id,
        meta.get("cache"),
        meta.get("model"),
        meta.get("voice"),
        len(audio),
    )

    headers = {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
        "X-Memo-Tts-Cache": str(meta.get("cache", "miss")),
        "X-Memo-Tts-Model": str(meta.get("model", "")),
        "X-Memo-Tts-Voice": str(meta.get("voice", "")),
        "X-Memo-Tts-Speed": f"{float(meta.get('speed', 1.0)):.2f}",
    }
    return Response(content=audio, media_type="audio/mpeg", headers=headers)
