from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class LibraryCollection(Base):
    """
    Curated, library-facing grouping of public decks.

    Distinct from `Category`: categories are private workspace organization for a single
    user. A LibraryCollection is platform-curated and visible to everyone (when
    `is_published` is true). Decks join a collection via the
    `library_collection_decks` junction so the same public deck can appear in several
    themed collections.
    """

    __tablename__ = "library_collections"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Ordering across the published-collections grid in the Library. Lower = earlier.
    # Renormalized contiguous on every reorder; legacy NULL falls back to created_at.
    position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    deck_links: Mapped[list["LibraryCollectionDeck"]] = relationship(
        "LibraryCollectionDeck",
        back_populates="collection",
        cascade="all, delete-orphan",
        order_by="LibraryCollectionDeck.position",
    )


class LibraryCollectionDeck(Base):
    """
    Junction row: ordered membership of a Deck inside a LibraryCollection.

    A (collection_id, deck_id) pair is unique; `position` is contiguous 0..n-1 within a
    collection and is renormalized after every add/remove/reorder. Deleting a deck
    cascades into this table; deleting a collection cascades via the relationship above.
    """

    __tablename__ = "library_collection_decks"
    __table_args__ = (
        UniqueConstraint(
            "collection_id",
            "deck_id",
            name="uq_library_collection_decks_collection_deck",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    collection_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("library_collections.id", ondelete="CASCADE"),
        nullable=False,
    )
    deck_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("decks.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    added_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    collection: Mapped["LibraryCollection"] = relationship(
        "LibraryCollection", back_populates="deck_links"
    )
