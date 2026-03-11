from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4
from sqlalchemy import Boolean, String, DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import SourceType


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
    source_type: Mapped[SourceType] = mapped_column(
        Enum(SourceType), default=SourceType.topic, nullable=False
    )
    source_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    source_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="decks")
    flashcards: Mapped[list["Flashcard"]] = relationship(
        "Flashcard", back_populates="deck", cascade="all, delete-orphan"
    )
