"""Per-category manual ordering via `Deck.category_position` (contiguous 0..n-1)."""

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Deck


def _legacy_sort_key():
    return case(
        (Deck.category_assigned_at.isnot(None), Deck.category_assigned_at),
        else_=Deck.created_at,
    )


def _nonnull_position_first():
    """Sort explicit positions before NULL (legacy / newly moved)."""
    return case((Deck.category_position.is_(None), 1), else_=0)


async def fetch_decks_in_category_ordered(
    db: AsyncSession, category_id: str, user_id: str
) -> list[Deck]:
    sk = _legacy_sort_key()
    pg = _nonnull_position_first()
    r = await db.execute(
        select(Deck)
        .where(
            Deck.category_id == category_id,
            Deck.user_id == user_id,
            Deck.archived == False,
        )
        .order_by(pg.asc(), Deck.category_position.asc(), sk.asc(), Deck.id.asc())
    )
    return list(r.scalars().all())


async def renormalize_category_positions(
    db: AsyncSession, category_id: str, user_id: str
) -> None:
    decks = await fetch_decks_in_category_ordered(db, category_id, user_id)
    for i, d in enumerate(decks):
        d.category_position = i
    await db.flush()


async def move_deck_to_bottom_of_category(
    db: AsyncSession, category_id: str, user_id: str, deck_id: str
) -> bool:
    """Move one deck to the end of manual order. Returns False if already last or not in category."""
    decks = await fetch_decks_in_category_ordered(db, category_id, user_id)
    idx = next((i for i, d in enumerate(decks) if d.id == deck_id), None)
    if idx is None or idx == len(decks) - 1:
        return False
    moved = decks.pop(idx)
    decks.append(moved)
    for i, d in enumerate(decks):
        d.category_position = i
    await db.flush()
    return True


async def reorder_deck_in_category(
    db: AsyncSession,
    category_id: str,
    user_id: str,
    deck_id: str,
    direction: str,
) -> None:
    decks = await fetch_decks_in_category_ordered(db, category_id, user_id)
    idx = next((i for i, d in enumerate(decks) if d.id == deck_id), None)
    if idx is None:
        raise LookupError("deck_not_in_category")
    if direction == "up":
        if idx == 0:
            raise ValueError("already_first")
        decks[idx - 1], decks[idx] = decks[idx], decks[idx - 1]
    elif direction == "down":
        if idx == len(decks) - 1:
            raise ValueError("already_last")
        decks[idx + 1], decks[idx] = decks[idx], decks[idx + 1]
    elif direction == "top":
        if idx == 0:
            raise ValueError("already_first")
        moved = decks.pop(idx)
        decks.insert(0, moved)
    elif direction == "bottom":
        if idx == len(decks) - 1:
            raise ValueError("already_last")
        moved = decks.pop(idx)
        decks.append(moved)
    else:
        raise ValueError("bad_direction")
    for i, d in enumerate(decks):
        d.category_position = i
    await db.flush()
