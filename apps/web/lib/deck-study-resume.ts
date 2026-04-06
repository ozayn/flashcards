/**
 * Per-deck study position in localStorage (v1). Keys the whole map by deck id.
 */

const STORAGE_KEY = "flashcards_deck_study_resume_v1";

export type DeckStudyResumeMode = "read" | "cards" | "quiz";

export type DeckStudyResumePayload = {
  index: number;
  mode: DeckStudyResumeMode;
  /** Back face visible (cards / quiz only). */
  flipped?: boolean;
  /** Card count when saved; used to detect deck changes (clamp still applies). */
  cardCount?: number;
};

function readAll(): Record<string, DeckStudyResumePayload> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return {};
    return j as Record<string, DeckStudyResumePayload>;
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, DeckStudyResumePayload>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota / private mode
  }
}

function isValidMode(m: unknown): m is DeckStudyResumeMode {
  return m === "read" || m === "cards" || m === "quiz";
}

export function readDeckStudyResume(deckId: string): DeckStudyResumePayload | null {
  const all = readAll();
  const p = all[deckId];
  if (!p || typeof p !== "object") return null;
  if (!isValidMode(p.mode)) return null;
  if (typeof p.index !== "number" || !Number.isFinite(p.index)) return null;
  return {
    index: Math.floor(p.index),
    mode: p.mode,
    flipped: typeof p.flipped === "boolean" ? p.flipped : undefined,
    cardCount: typeof p.cardCount === "number" && Number.isFinite(p.cardCount) ? Math.floor(p.cardCount) : undefined,
  };
}

export function writeDeckStudyResume(deckId: string, payload: DeckStudyResumePayload) {
  const all = readAll();
  all[deckId] = {
    index: payload.index,
    mode: payload.mode,
    flipped: payload.flipped,
    cardCount: payload.cardCount,
  };
  writeAll(all);
}

export function clearDeckStudyResume(deckId: string) {
  const all = readAll();
  delete all[deckId];
  writeAll(all);
}

export function clampCardIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(Math.floor(index), length - 1));
}
