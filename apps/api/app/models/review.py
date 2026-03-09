from __future__ import annotations

from datetime import datetime
from uuid import uuid4
from sqlalchemy import DateTime, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import ReviewRating


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    flashcard_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("flashcards.id", ondelete="CASCADE"),
        nullable=False,
    )
    rating: Mapped[ReviewRating] = mapped_column(
        Enum(ReviewRating), nullable=False
    )
    review_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    next_review: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="reviews")
    flashcard: Mapped["Flashcard"] = relationship(
        "Flashcard", back_populates="reviews"
    )
