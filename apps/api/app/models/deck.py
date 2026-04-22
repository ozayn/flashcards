from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import DeckStudyStatus, GenerationStatus, SourceType


class Deck(Base):
    __tablename__ = "decks"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    source_type: Mapped[Optional[SourceType]] = mapped_column(
        Enum(SourceType, name="sourcetype", create_type=False),
        nullable=True,
    )
    source_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    source_title: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    source_topic: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    source_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_segments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # JSON blob for source-specific metadata (e.g. YouTube duration_seconds, caption_language).
    source_metadata: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Short LLM summary of long text / transcript / article (optional; additive).
    source_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    generation_status: Mapped[str] = mapped_column(
        String(32), default=GenerationStatus.completed.value, nullable=False
    )
    generated_by_ai: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    category_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    category_assigned_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    # Contiguous 0..n-1 within category_id for this user; None = legacy / use sort key until renormalized.
    category_position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    study_status: Mapped[str] = mapped_column(
        String(32),
        default=DeckStudyStatus.not_started.value,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="decks")
    category: Mapped[Optional["Category"]] = relationship(
        "Category", back_populates="decks"
    )
    flashcards: Mapped[list["Flashcard"]] = relationship(
        "Flashcard", back_populates="deck", cascade="all, delete-orphan"
    )
