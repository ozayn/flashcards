from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class FlashcardBookmark(Base):
    """Per-user saved card for later review (v1: single bookmark flag)."""

    __tablename__ = "flashcard_bookmarks"

    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    flashcard_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("flashcards.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
