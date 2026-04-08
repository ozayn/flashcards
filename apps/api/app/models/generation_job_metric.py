"""Persisted timing and outcome for each flashcard generation HTTP job (admin analytics)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class GenerationJobMetric(Base):
    """
    One row per POST /generate-flashcards (or background completion) invocation.
    Transcript/source-fetch times are often null (client-side or separate requests).
    """

    __tablename__ = "generation_job_metrics"
    __table_args__ = (
        Index("ix_generation_job_metrics_completed_at", "completed_at"),
        Index("ix_generation_job_metrics_source_type", "source_type"),
        Index("ix_generation_job_metrics_deck_id", "deck_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    gen_job_id: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    deck_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("decks.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    failure_tag: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    cards_requested: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cards_created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cards_provider: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")

    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    total_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Wall time of asyncio.to_thread(_sync_prepare_generated_cards) — cards LLM + grounding + parse
    prepare_phase_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    transcript_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source_fetch_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    card_generation_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    grounding_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    summary_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # max(0, total_ms - transcript - source_fetch - card_generation - grounding - summary)
    other_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Optional note for future (e.g. chunked_mode); keep compact
    meta_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
