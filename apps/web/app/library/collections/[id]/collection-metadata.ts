/**
 * Pure helpers for building library-collection Open Graph / Twitter metadata.
 *
 * Kept separate from `layout.tsx` so it can be unit-tested in isolation: route segment
 * files in the Next.js App Router only allow specific named exports (metadata,
 * generateMetadata, dynamic, revalidate, default, …), so we cannot expose arbitrary
 * helpers directly from a layout file for tests.
 */

export type CollectionMetaShape = {
  id: string;
  title?: string | null;
  description?: string | null;
  is_published?: boolean | null;
  deck_count?: number | null;
  total_card_count?: number | null;
};

export const COLLECTION_METADATA_SITE_NAME = "MemoNext";
export const COLLECTION_METADATA_GENERIC_TITLE = "Collection · MemoNext";
export const COLLECTION_METADATA_GENERIC_DESCRIPTION =
  "A curated collection of flashcard decks on MemoNext.";

/** Hard cap on title text rendered into OG/Twitter; long titles trim at a word boundary. */
export const COLLECTION_METADATA_MAX_TITLE_LEN = 70;
/** OG description sweet spot is ~200 chars; longer values are truncated for share previews. */
export const COLLECTION_METADATA_MAX_DESCRIPTION_LEN = 200;

/**
 * Word-boundary-aware truncation with ellipsis. Cuts at a space only if it lands in the
 * last 40% of the slice; otherwise cuts hard and appends `…`. This keeps long single-word
 * inputs (URLs, run-on phrases) from collapsing to nothing.
 */
export function truncateForCollectionMetadata(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

/**
 * Build the deck-count / card-count fragment used in the description fallback.
 * Returns null when neither is available, so callers can drop the prefix entirely.
 */
export function buildCollectionMetadataCountsSummary(
  deckCount: number | null,
  cardCount: number | null,
): string | null {
  const parts: string[] = [];
  if (deckCount != null && deckCount > 0) {
    parts.push(`${deckCount} ${deckCount === 1 ? "deck" : "decks"}`);
  }
  if (cardCount != null && cardCount > 0) {
    parts.push(`${cardCount} ${cardCount === 1 ? "card" : "cards"}`);
  }
  if (parts.length === 0) return null;
  return `${parts.join(" · ")} · ${COLLECTION_METADATA_SITE_NAME}`;
}

/**
 * Description fallback chain for collection OG/Twitter previews:
 *
 * 1. Explicit collection description (truncated)
 * 2. `N decks · N cards · MemoNext` derived from count data
 * 3. Generic `A curated collection of flashcard decks on MemoNext.`
 */
export function buildCollectionMetadataDescription(
  collection: CollectionMetaShape,
): string {
  const explicit = collection.description?.trim();
  if (explicit) {
    return truncateForCollectionMetadata(
      explicit,
      COLLECTION_METADATA_MAX_DESCRIPTION_LEN,
    );
  }

  const deckCount =
    typeof collection.deck_count === "number" ? collection.deck_count : null;
  const cardCount =
    typeof collection.total_card_count === "number"
      ? collection.total_card_count
      : null;
  const counts = buildCollectionMetadataCountsSummary(deckCount, cardCount);
  if (counts) {
    return truncateForCollectionMetadata(
      counts,
      COLLECTION_METADATA_MAX_DESCRIPTION_LEN,
    );
  }
  return COLLECTION_METADATA_GENERIC_DESCRIPTION;
}

/**
 * Page-title text for OG/Twitter: `<collection title> · MemoNext`, trimmed so the
 * combined length stays under `COLLECTION_METADATA_MAX_TITLE_LEN`. Falls back to the
 * generic title when the title is missing or empty.
 */
export function buildCollectionMetadataTitle(
  collection: CollectionMetaShape,
): string {
  const title = collection.title?.trim();
  if (!title) return COLLECTION_METADATA_GENERIC_TITLE;
  const suffix = ` · ${COLLECTION_METADATA_SITE_NAME}`;
  const trimmed = truncateForCollectionMetadata(
    title,
    COLLECTION_METADATA_MAX_TITLE_LEN - suffix.length,
  );
  return `${trimmed}${suffix}`;
}
