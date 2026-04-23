from __future__ import annotations

from datetime import datetime
from uuid import uuid4
from sqlalchemy import String, DateTime, Enum, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import UserRole, Plan


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    # Stable Google subject (OpenID "sub"); null for legacy/local users only.
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    # Profile image URL from Google OAuth sync; null for legacy or before first sign-in.
    picture_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), default=UserRole.user, nullable=False
    )
    plan: Mapped[Plan] = mapped_column(
        Enum(Plan), default=Plan.free, nullable=False
    )
    think_delay_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    think_delay_ms: Mapped[int] = mapped_column(
        Integer, default=1500, nullable=False
    )
    # Flashcard UI style preference (paper, minimal, modern, anki)
    card_style: Mapped[str] = mapped_column(
        String(32), default="paper", nullable=False
    )
    # Browser TTS: preferred English voice style (default, british, american)
    english_tts: Mapped[str] = mapped_column(
        String(16), default="default", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    decks: Mapped[list["Deck"]] = relationship(
        "Deck", back_populates="user", cascade="all, delete-orphan"
    )
    reviews: Mapped[list["Review"]] = relationship(
        "Review", back_populates="user", cascade="all, delete-orphan"
    )
