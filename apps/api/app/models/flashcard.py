from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4
from sqlalchemy import String, DateTime, ForeignKey, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Flashcard(Base):
    __tablename__ = "flashcards"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    deck_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("decks.id", ondelete="CASCADE"), nullable=False
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer_short: Mapped[str] = mapped_column(String(1000), nullable=False)
    answer_example: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    answer_detailed: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Public URL path segment for the API, e.g. flashcard-images/{uuid}.png (served by GET /flashcard-images/...)
    image_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    difficulty: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    deck: Mapped["Deck"] = relationship("Deck", back_populates="flashcards")
    reviews: Mapped[list["Review"]] = relationship(
        "Review", back_populates="flashcard", cascade="all, delete-orphan"
    )
