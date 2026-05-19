/**
 * Pure helpers for building deck-detail Open Graph / Twitter metadata.
 *
 * Kept separate from `layout.tsx` so it can be unit-tested in isolation: route segment
 * files in the Next.js App Router only allow specific named exports (metadata,
 * generateMetadata, dynamic, revalidate, default, …), so we cannot expose pure helpers
 * directly from a layout file for tests.
 */

export type DeckMetaShape = {
  id: string;
  name?: string | null;
  description?: string | null;
  is_public?: boolean | null;
  card_count?: number | null;
  source_type?: string | null;
  source_topic?: string | null;
  source_summary?: string | null;
};

export const DECK_METADATA_SITE_NAME = "MemoNext";
export const DECK_METADATA_GENERIC_TITLE = "Deck · MemoNext";
export const DECK_METADATA_GENERIC_DESCRIPTION = "Flashcards on MemoNext.";

/** Hard cap on title text rendered into OG/Twitter; long titles get trimmed at word boundary. */
export const DECK_METADATA_MAX_TITLE_LEN = 70;
/** OG description sweet spot is ~200 chars; longer values are truncated for share previews. */
export const DECK_METADATA_MAX_DESCRIPTION_LEN = 200;

/**
 * Word-boundary-aware truncation with ellipsis. We only cut at a space if it falls in
 * the last 40% of the slice; otherwise we cut hard and append `…`. This avoids losing
 * almost all the text for inputs where the first word alone already exceeds `max`.
 */
export function truncateForDeckMetadata(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

/**
 * Description fallback chain for the deck page OG/Twitter preview:
 *
 * 1. Explicit deck description (truncated)
 * 2. `Flashcards on <topic>` with optional ` · N cards on MemoNext` suffix
 * 3. LLM-generated source summary (truncated)
 * 4. `N cards on MemoNext` if a card count is known
 * 5. Generic `Flashcards on MemoNext.`
 */
export function buildDeckMetadataDescription(deck: DeckMetaShape): string {
  const explicit = deck.description?.trim();
  if (explicit) return truncateForDeckMetadata(explicit, DECK_METADATA_MAX_DESCRIPTION_LEN);

  const count = typeof deck.card_count === "number" && deck.card_count > 0 ? deck.card_count : null;
  const cardsLabel =
    count != null ? `${count} ${count === 1 ? "card" : "cards"} on ${DECK_METADATA_SITE_NAME}` : null;

  const topic = deck.source_topic?.trim();
  if (topic) {
    const base = `Flashcards on ${truncateForDeckMetadata(topic, 120)}`;
    return cardsLabel
      ? truncateForDeckMetadata(`${base} · ${cardsLabel}`, DECK_METADATA_MAX_DESCRIPTION_LEN)
      : truncateForDeckMetadata(base, DECK_METADATA_MAX_DESCRIPTION_LEN);
  }

  const summary = deck.source_summary?.trim();
  if (summary) return truncateForDeckMetadata(summary, DECK_METADATA_MAX_DESCRIPTION_LEN);

  return cardsLabel ?? DECK_METADATA_GENERIC_DESCRIPTION;
}

/**
 * Page-title text for OG/Twitter: `<deck name> · MemoNext`, trimmed so the combined
 * length stays under `DECK_METADATA_MAX_TITLE_LEN`. Falls back to the generic title
 * when the deck name is missing or empty.
 */
export function buildDeckMetadataTitle(deck: DeckMetaShape): string {
  const name = deck.name?.trim();
  if (!name) return DECK_METADATA_GENERIC_TITLE;
  const suffix = ` · ${DECK_METADATA_SITE_NAME}`;
  const trimmedName = truncateForDeckMetadata(name, DECK_METADATA_MAX_TITLE_LEN - suffix.length);
  return `${trimmedName}${suffix}`;
}
