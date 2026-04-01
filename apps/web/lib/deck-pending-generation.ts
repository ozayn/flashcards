/**
 * One-shot hint: user just navigated here after starting background flashcard generation
 * (create flow: YouTube / URL / long text / topic). Used to show a distinct loading state.
 */
const PREFIX = "deck_bg_gen_";
const MAX_AGE_MS = 3 * 60 * 1000;

export function markDeckBackgroundGenerationNavigation(deckId: string): void {
  try {
    sessionStorage.setItem(PREFIX + deckId, String(Date.now()));
  } catch {
    /* private mode */
  }
}

export function peekDeckBackgroundGenerationPending(deckId: string): boolean {
  try {
    const raw = sessionStorage.getItem(PREFIX + deckId);
    if (!raw) return false;
    const t = Number(raw);
    if (!Number.isFinite(t) || Date.now() - t > MAX_AGE_MS) {
      sessionStorage.removeItem(PREFIX + deckId);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearDeckBackgroundGenerationPending(deckId: string): void {
  try {
    sessionStorage.removeItem(PREFIX + deckId);
  } catch {
    /* ignore */
  }
}
