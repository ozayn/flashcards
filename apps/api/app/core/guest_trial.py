"""Stable sandbox user for signed-out trial decks (legacy user; no OAuth)."""

from __future__ import annotations

# Fixed UUID — must match apps/web NEXT_PUBLIC_GUEST_TRIAL_USER_ID.
GUEST_TRIAL_USER_ID = "a0000000-0000-4000-8000-000000000001"
GUEST_TRIAL_EMAIL = "guest-trial@memonext.local"
# Total flashcards allowed on guest-owned decks (aligned with web GUEST_TRIAL_MAX_CARDS).
GUEST_TRIAL_MAX_CARDS_TOTAL = 5


def is_guest_trial_user_id(user_id: str | None) -> bool:
    return bool(user_id and user_id.strip() == GUEST_TRIAL_USER_ID)
