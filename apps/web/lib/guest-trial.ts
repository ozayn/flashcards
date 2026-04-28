/**
 * Signed-out trial: one deck at a time, max GUEST_TRIAL_MAX_CARDS AI-generated cards.
 * Deck rows live under API guest legacy user (NEXT_PUBLIC_GUEST_TRIAL_USER_ID).
 */

export const GUEST_TRIAL_MAX_CARDS = 5;

export const GUEST_TRIAL_DECK_STORAGE_KEY = "memonext_guest_trial_deck_id";

/** Must match apps/api app.core.guest_trial.GUEST_TRIAL_USER_ID when trial mode is enabled. */
export function getGuestTrialUserId(): string | null {
  const id = process.env.NEXT_PUBLIC_GUEST_TRIAL_USER_ID?.trim();
  return id || null;
}

export function getStoredGuestTrialDeckId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(GUEST_TRIAL_DECK_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredGuestTrialDeckId(deckId: string): void {
  try {
    localStorage.setItem(GUEST_TRIAL_DECK_STORAGE_KEY, deckId);
  } catch {
    /* ignore */
  }
}

export function clearStoredGuestTrialDeckId(): void {
  try {
    localStorage.removeItem(GUEST_TRIAL_DECK_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isGuestTrialDeckForViewer(
  deckUserId: string | undefined,
  sessionStatus: "loading" | "authenticated" | "unauthenticated"
): boolean {
  if (sessionStatus !== "unauthenticated") return false;
  const gid = getGuestTrialUserId();
  return Boolean(gid && deckUserId === gid);
}
