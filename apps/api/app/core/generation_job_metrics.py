"""Persist generation job timing rows for admin analytics."""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GenerationJobMetric

logger = logging.getLogger(__name__)


def _compute_other_ms(
    total_ms: int,
    *,
    transcript_ms: Optional[int],
    source_fetch_ms: Optional[int],
    card_generation_ms: Optional[int],
    grounding_ms: Optional[int],
    summary_ms: Optional[int],
) -> int:
    parts = [
        transcript_ms or 0,
        source_fetch_ms or 0,
        card_generation_ms or 0,
        grounding_ms or 0,
        summary_ms or 0,
    ]
    return max(0, int(total_ms) - sum(parts))


async def persist_generation_job_metric(
    db: AsyncSession,
    *,
    deck_id: str,
    user_id: Optional[str],
    gen_job_id: str,
    source_type: str,
    success: bool,
    failure_tag: Optional[str],
    cards_requested: int,
    cards_created: int,
    cards_provider: str,
    started_at: datetime,
    completed_at: datetime,
    total_ms: int,
    prepare_phase_ms: Optional[int],
    lifecycle_meta: dict[str, Any],
    summary_ms: Optional[int],
    transcript_ms: Optional[int] = None,
    source_fetch_ms: Optional[int] = None,
) -> None:
    gs = (lifecycle_meta or {}).get("grounding_stats") or {}
    grounding_ms: Optional[int] = None
    if gs.get("calls"):
        grounding_ms = int(gs.get("total_ms") or 0)

    cg_raw = lifecycle_meta.get("card_gen_approx_ms")
    card_generation_ms: Optional[int] = None
    if cg_raw is not None:
        try:
            card_generation_ms = int(cg_raw)
        except (TypeError, ValueError):
            card_generation_ms = None

    other_ms = _compute_other_ms(
        total_ms,
        transcript_ms=transcript_ms,
        source_fetch_ms=source_fetch_ms,
        card_generation_ms=card_generation_ms,
        grounding_ms=grounding_ms,
        summary_ms=summary_ms,
    )

    meta_compact: dict[str, Any] = {}
    if lifecycle_meta.get("chunked_mode") is not None:
        meta_compact["chunked"] = bool(lifecycle_meta.get("chunked_mode"))
    if lifecycle_meta.get("chunk_count") is not None:
        try:
            meta_compact["chunks"] = int(lifecycle_meta.get("chunk_count") or 0)
        except (TypeError, ValueError):
            pass
    meta_json = json.dumps(meta_compact, separators=(",", ":")) if meta_compact else None

    row = GenerationJobMetric(
        gen_job_id=gen_job_id[:24],
        deck_id=deck_id,
        user_id=user_id,
        source_type=(source_type or "unknown")[:32],
        success=bool(success),
        failure_tag=(failure_tag[:64] if failure_tag else None),
        cards_requested=max(0, int(cards_requested)),
        cards_created=max(0, int(cards_created)),
        cards_provider=(cards_provider or "unknown")[:32],
        started_at=started_at,
        completed_at=completed_at,
        total_ms=max(0, int(total_ms)),
        prepare_phase_ms=prepare_phase_ms,
        transcript_ms=transcript_ms,
        source_fetch_ms=source_fetch_ms,
        card_generation_ms=card_generation_ms,
        grounding_ms=grounding_ms,
        summary_ms=summary_ms,
        other_ms=other_ms,
        meta_json=meta_json,
    )
    db.add(row)
    await db.flush()
