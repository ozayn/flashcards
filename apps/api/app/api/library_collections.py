"""
Library collections: curated, platform-managed groupings of public decks.

Public read endpoints (no auth): list published collections, view one, list its decks.
Admin write endpoints (platform admin only): CRUD on collections, add/remove/reorder
member decks.

This module is intentionally separate from `categories.py` because the two concepts
serve different products:
  - `Category` belongs to a single user and organizes their personal "My Decks" workspace.
  - `LibraryCollection` is curated by platform admins and visible to all viewers.

Ordering inside a collection lives on the junction row (`position`) and is renormalized
to a contiguous 0..n-1 sequence after every add/remove/reorder.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import asc, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response

from app.core.database import get_db
from app.core.platform_admin import require_platform_admin
from app.models import Deck, Flashcard, LibraryCollection, LibraryCollectionDeck, User
from app.schemas.deck import DeckResponse
from app.schemas.library_collection import (
    LibraryCollectionAddDeckRequest,
    LibraryCollectionCreate,
    LibraryCollectionDetailResponse,
    LibraryCollectionReorderDeckRequest,
    LibraryCollectionResponse,
    LibraryCollectionUpdate,
)

router = APIRouter(prefix="/library-collections", tags=["library_collections"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _ordered_links_for_collection(
    db: AsyncSession, collection_id: str
) -> list[LibraryCollectionDeck]:
    """All deck-link rows in a collection, ordered by `position` then `added_at`."""
    res = await db.execute(
        select(LibraryCollectionDeck)
        .where(LibraryCollectionDeck.collection_id == collection_id)
        .order_by(
            asc(LibraryCollectionDeck.position),
            asc(LibraryCollectionDeck.added_at),
        )
    )
    return list(res.scalars().all())


async def _renormalize_positions(db: AsyncSession, collection_id: str) -> None:
    """Rewrite `position` to a contiguous 0..n-1 sequence in current order."""
    links = await _ordered_links_for_collection(db, collection_id)
    for idx, link in enumerate(links):
        if link.position != idx:
            link.position = idx
    await db.flush()


async def _fetch_decks_and_counts(
    db: AsyncSession, deck_ids: list[str]
) -> tuple[dict[str, Deck], dict[str, int]]:
    """Return (deck_id -> Deck) and (deck_id -> flashcard_count) for the given ids."""
    if not deck_ids:
        return {}, {}
    deck_res = await db.execute(select(Deck).where(Deck.id.in_(deck_ids)))
    deck_by_id = {d.id: d for d in deck_res.scalars().all()}
    count_res = await db.execute(
        select(Flashcard.deck_id, func.count(Flashcard.id))
        .where(Flashcard.deck_id.in_(deck_ids))
        .group_by(Flashcard.deck_id)
    )
    counts = {row[0]: row[1] for row in count_res.all()}
    return deck_by_id, counts


async def _stats_for_collections(
    db: AsyncSession, collection_ids: list[str]
) -> dict[str, tuple[int, int]]:
    """
    Return collection_id -> (deck_count, total_card_count) for the given collections.

    Counts only visible decks: deck rows that exist, are not archived, and remain public.
    """
    if not collection_ids:
        return {}
    res = await db.execute(
        select(
            LibraryCollectionDeck.collection_id,
            func.count(Deck.id),
            func.coalesce(func.sum(_card_count_subquery()), 0),
        )
        .join(Deck, Deck.id == LibraryCollectionDeck.deck_id)
        .where(
            LibraryCollectionDeck.collection_id.in_(collection_ids),
            Deck.archived == False,  # noqa: E712
            Deck.is_public == True,  # noqa: E712
        )
        .group_by(LibraryCollectionDeck.collection_id)
    )
    return {row[0]: (int(row[1] or 0), int(row[2] or 0)) for row in res.all()}


def _card_count_subquery():
    """Correlated subquery: number of flashcards for the joined deck."""
    return (
        select(func.count(Flashcard.id))
        .where(Flashcard.deck_id == Deck.id)
        .correlate(Deck)
        .scalar_subquery()
    )


def _collection_summary(
    collection: LibraryCollection,
    deck_count: int,
    total_card_count: int,
) -> LibraryCollectionResponse:
    return LibraryCollectionResponse.model_validate(collection).model_copy(
        update={"deck_count": deck_count, "total_card_count": total_card_count}
    )


# ---------------------------------------------------------------------------
# Public read endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=List[LibraryCollectionResponse])
async def list_published_collections(
    db: AsyncSession = Depends(get_db),
):
    """Public: list collections that are published. Empty list when none."""
    res = await db.execute(
        select(LibraryCollection)
        .where(LibraryCollection.is_published == True)  # noqa: E712
        .order_by(
            asc(LibraryCollection.position).nulls_last(),
            asc(LibraryCollection.created_at),
        )
    )
    collections = list(res.scalars().all())
    if not collections:
        return []
    stats = await _stats_for_collections(db, [c.id for c in collections])
    return [
        _collection_summary(c, *stats.get(c.id, (0, 0))) for c in collections
    ]


@router.get(
    "/{collection_id}", response_model=LibraryCollectionDetailResponse
)
async def get_collection(
    collection_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Public: get one published collection and its decks (in curator order).

    Returns 404 for unpublished collections so unpublished IDs do not leak even via
    direct URL guessing.
    """
    res = await db.execute(
        select(LibraryCollection).where(LibraryCollection.id == collection_id)
    )
    collection = res.scalar_one_or_none()
    if not collection or not collection.is_published:
        raise HTTPException(status_code=404, detail="Collection not found")
    return await _build_detail_response(db, collection)


# ---------------------------------------------------------------------------
# Admin endpoints (require platform admin)
# ---------------------------------------------------------------------------


@router.get(
    "/admin/all", response_model=List[LibraryCollectionResponse]
)
async def admin_list_all_collections(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    """Admin: list every collection (published and drafts), ordered like the public list."""
    res = await db.execute(
        select(LibraryCollection).order_by(
            asc(LibraryCollection.position).nulls_last(),
            asc(LibraryCollection.created_at),
        )
    )
    collections = list(res.scalars().all())
    if not collections:
        return []
    stats = await _stats_for_collections(db, [c.id for c in collections])
    return [
        _collection_summary(c, *stats.get(c.id, (0, 0))) for c in collections
    ]


@router.post("", response_model=LibraryCollectionResponse, status_code=201)
async def admin_create_collection(
    payload: LibraryCollectionCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    """Admin: create a new collection. Position is appended to the end."""
    next_position = await _next_collection_position(db)
    collection = LibraryCollection(
        title=payload.title.strip(),
        description=(payload.description or "").strip() or None,
        is_published=bool(payload.is_published),
        position=next_position,
    )
    db.add(collection)
    await db.flush()
    await db.refresh(collection)
    return _collection_summary(collection, 0, 0)


@router.get(
    "/admin/{collection_id}",
    response_model=LibraryCollectionDetailResponse,
)
async def admin_get_collection(
    collection_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    """Admin: detail view for a collection (published or draft)."""
    collection = await _load_collection_or_404(db, collection_id)
    return await _build_detail_response(db, collection)


@router.patch(
    "/{collection_id}", response_model=LibraryCollectionResponse
)
async def admin_update_collection(
    collection_id: str,
    payload: LibraryCollectionUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    """Admin: rename, update description, or flip published state."""
    collection = await _load_collection_or_404(db, collection_id)
    if payload.title is not None:
        collection.title = payload.title.strip()
    if payload.description is not None:
        cleaned = payload.description.strip()
        collection.description = cleaned or None
    if payload.is_published is not None:
        collection.is_published = bool(payload.is_published)
    await db.flush()
    await db.refresh(collection)
    stats = await _stats_for_collections(db, [collection.id])
    return _collection_summary(collection, *stats.get(collection.id, (0, 0)))


@router.delete("/{collection_id}", status_code=204)
async def admin_delete_collection(
    collection_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    """Admin: delete a collection. Junction rows cascade; decks themselves are untouched."""
    collection = await _load_collection_or_404(db, collection_id)
    await db.delete(collection)
    await db.flush()
    return Response(status_code=204)


@router.post(
    "/{collection_id}/decks",
    response_model=LibraryCollectionDetailResponse,
)
async def admin_add_deck_to_collection(
    collection_id: str,
    payload: LibraryCollectionAddDeckRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    """
    Admin: add a public deck to a collection.

    409 if the deck is already in the collection.
    400 if the deck is private/archived (admins curate public-only).
    Defaults to appending to the end; pass `position` to insert.
    """
    collection = await _load_collection_or_404(db, collection_id)

    deck_res = await db.execute(select(Deck).where(Deck.id == payload.deck_id))
    deck = deck_res.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    if not deck.is_public or deck.archived:
        raise HTTPException(
            status_code=400,
            detail="Only public, non-archived decks can be added to a library collection.",
        )

    existing = await db.execute(
        select(LibraryCollectionDeck).where(
            LibraryCollectionDeck.collection_id == collection_id,
            LibraryCollectionDeck.deck_id == payload.deck_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Deck is already in this collection")

    links = await _ordered_links_for_collection(db, collection_id)
    insert_at = payload.position if payload.position is not None else len(links)
    insert_at = max(0, min(insert_at, len(links)))

    link = LibraryCollectionDeck(
        collection_id=collection_id,
        deck_id=payload.deck_id,
        position=insert_at,
    )
    db.add(link)
    await db.flush()

    # Shift existing links so positions stay contiguous after the new insertion.
    for idx, existing_link in enumerate(links):
        target = idx if idx < insert_at else idx + 1
        if existing_link.position != target:
            existing_link.position = target
    await db.flush()
    await _renormalize_positions(db, collection_id)
    await db.refresh(collection)
    return await _build_detail_response(db, collection)


@router.delete(
    "/{collection_id}/decks/{deck_id}", status_code=204
)
async def admin_remove_deck_from_collection(
    collection_id: str,
    deck_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    """Admin: remove a deck from a collection (deck itself is not affected)."""
    await _load_collection_or_404(db, collection_id)
    await db.execute(
        delete(LibraryCollectionDeck).where(
            LibraryCollectionDeck.collection_id == collection_id,
            LibraryCollectionDeck.deck_id == deck_id,
        )
    )
    await _renormalize_positions(db, collection_id)
    return Response(status_code=204)


@router.post(
    "/{collection_id}/decks/{deck_id}/reorder",
    response_model=LibraryCollectionDetailResponse,
)
async def admin_reorder_deck_in_collection(
    collection_id: str,
    deck_id: str,
    payload: LibraryCollectionReorderDeckRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    """Admin: move a deck up/down/top/bottom inside a collection."""
    collection = await _load_collection_or_404(db, collection_id)
    links = await _ordered_links_for_collection(db, collection_id)
    idx = next((i for i, link in enumerate(links) if link.deck_id == deck_id), -1)
    if idx == -1:
        raise HTTPException(status_code=404, detail="Deck not in this collection")

    target_idx = idx
    if payload.direction == "up":
        if idx == 0:
            raise HTTPException(status_code=400, detail="Deck is already first")
        target_idx = idx - 1
    elif payload.direction == "down":
        if idx == len(links) - 1:
            raise HTTPException(status_code=400, detail="Deck is already last")
        target_idx = idx + 1
    elif payload.direction == "top":
        if idx == 0:
            raise HTTPException(status_code=400, detail="Deck is already first")
        target_idx = 0
    elif payload.direction == "bottom":
        if idx == len(links) - 1:
            raise HTTPException(status_code=400, detail="Deck is already last")
        target_idx = len(links) - 1

    moved = links.pop(idx)
    links.insert(target_idx, moved)
    for new_pos, link in enumerate(links):
        if link.position != new_pos:
            link.position = new_pos
    await db.flush()
    await db.refresh(collection)
    return await _build_detail_response(db, collection)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _load_collection_or_404(
    db: AsyncSession, collection_id: str
) -> LibraryCollection:
    res = await db.execute(
        select(LibraryCollection).where(LibraryCollection.id == collection_id)
    )
    collection = res.scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    return collection


async def _next_collection_position(db: AsyncSession) -> int:
    res = await db.execute(
        select(func.coalesce(func.max(LibraryCollection.position), -1))
    )
    current_max = int(res.scalar_one() or -1)
    return current_max + 1


async def _build_detail_response(
    db: AsyncSession, collection: LibraryCollection
) -> LibraryCollectionDetailResponse:
    """
    Materialize the detail response with the curated, filtered deck list.

    Filter: only public, non-archived decks. Anyone (signed-in or out) can hit this
    endpoint, so we never leak private/archived decks even if a curator accidentally
    added one earlier (or the deck owner later flipped it back to private).
    """
    links = await _ordered_links_for_collection(db, collection.id)
    deck_ids = [link.deck_id for link in links]
    deck_by_id, counts = await _fetch_decks_and_counts(db, deck_ids)

    ordered_decks: list[DeckResponse] = []
    total_cards = 0
    for link in links:
        deck = deck_by_id.get(link.deck_id)
        if not deck or not deck.is_public or deck.archived:
            continue
        card_count = int(counts.get(deck.id, 0))
        total_cards += card_count
        ordered_decks.append(
            DeckResponse.model_validate(deck).model_copy(
                update={"card_count": card_count}
            )
        )

    return LibraryCollectionDetailResponse.model_validate(collection).model_copy(
        update={
            "deck_count": len(ordered_decks),
            "total_card_count": total_cards,
            "decks": ordered_decks,
        }
    )
