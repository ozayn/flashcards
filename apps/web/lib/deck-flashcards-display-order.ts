/**
 * Same ordering/filtering as the deck detail card list (grid/list + modal).
 * Used so "Save & Next" follows the order the user was browsing.
 */

export type DeckCardSortMode = "newest" | "oldest" | "az";

export type DeckFlashcardOrderInput = {
  id: string;
  question: string;
  answer_short: string;
  answer_example?: string | null;
  answer_detailed?: string | null;
  bookmarked?: boolean;
};

export type DeckFlashcardViewOptions = {
  cardSort: DeckCardSortMode;
  cardSearch: string;
  cardBookmarkFilter: "all" | "bookmarked";
  currentUserId: string | null;
};

export function orderDeckFlashcardsForDisplay<T extends DeckFlashcardOrderInput>(
  flashcards: T[],
  opts: DeckFlashcardViewOptions
): T[] {
  let cards = [...flashcards];
  const q = opts.cardSearch.trim().toLowerCase();
  if (q) {
    cards = cards.filter(
      (c) =>
        c.question.toLowerCase().includes(q) ||
        c.answer_short.toLowerCase().includes(q) ||
        (c.answer_example || "").toLowerCase().includes(q) ||
        (c.answer_detailed || "").toLowerCase().includes(q)
    );
  }
  if (opts.currentUserId && opts.cardBookmarkFilter === "bookmarked") {
    cards = cards.filter((c) => c.bookmarked);
  }
  if (opts.cardSort === "oldest") {
    cards.reverse();
  } else if (opts.cardSort === "az") {
    cards.sort((a, b) => a.question.localeCompare(b.question));
  }
  return cards;
}

/** Query suffix for edit-card URLs, e.g. `?sort=newest&bookmarked=1`. */
export function buildDeckEditCardQuerySuffix(opts: {
  sort: DeckCardSortMode;
  q: string;
  bookmarked: "all" | "bookmarked";
}): string {
  const params = new URLSearchParams();
  params.set("sort", opts.sort);
  const qt = opts.q.trim();
  if (qt) params.set("q", qt);
  if (opts.bookmarked === "bookmarked") params.set("bookmarked", "1");
  const s = params.toString();
  return s ? `?${s}` : "";
}

export type DeckEditCardQueryState = Pick<
  DeckFlashcardViewOptions,
  "cardSort" | "cardSearch" | "cardBookmarkFilter"
>;

export function parseDeckEditCardQuery(
  searchParams: URLSearchParams
): DeckEditCardQueryState {
  const sortRaw = (searchParams.get("sort") || "newest").toLowerCase();
  const cardSort: DeckCardSortMode =
    sortRaw === "oldest" || sortRaw === "az" ? sortRaw : "newest";
  const cardSearch = searchParams.get("q") || "";
  const cardBookmarkFilter =
    searchParams.get("bookmarked") === "1" ? "bookmarked" : "all";
  return { cardSort, cardSearch, cardBookmarkFilter };
}

function orderedIndexForSaveNavigation<T extends DeckFlashcardOrderInput>(
  flashcards: T[],
  currentId: string,
  baseOpts: DeckEditCardQueryState,
  currentUserId: string | null
): { ordered: T[]; index: number } {
  const fullOpts: DeckFlashcardViewOptions = { ...baseOpts, currentUserId };
  let ordered = orderDeckFlashcardsForDisplay(flashcards, fullOpts);
  let index = ordered.findIndex((c) => c.id === currentId);
  if (index === -1) {
    ordered = orderDeckFlashcardsForDisplay(flashcards, {
      ...fullOpts,
      cardSearch: "",
    });
    index = ordered.findIndex((c) => c.id === currentId);
  }
  return { ordered, index };
}

export function getNextEditCardId<T extends DeckFlashcardOrderInput>(
  flashcards: T[],
  currentId: string,
  baseOpts: DeckEditCardQueryState,
  currentUserId: string | null
): string | null {
  const { ordered, index } = orderedIndexForSaveNavigation(
    flashcards,
    currentId,
    baseOpts,
    currentUserId
  );
  if (index < 0 || index >= ordered.length - 1) return null;
  return ordered[index + 1]!.id;
}

export function getPrevEditCardId<T extends DeckFlashcardOrderInput>(
  flashcards: T[],
  currentId: string,
  baseOpts: DeckEditCardQueryState,
  currentUserId: string | null
): string | null {
  const { ordered, index } = orderedIndexForSaveNavigation(
    flashcards,
    currentId,
    baseOpts,
    currentUserId
  );
  if (index <= 0) return null;
  return ordered[index - 1]!.id;
}

/**
 * 1-based position and count in the same ordered list as Save & Next / Save & Previous.
 * Returns null if the current card is not found (should not happen on a valid edit URL).
 */
export function getEditCardPositionInList<T extends DeckFlashcardOrderInput>(
  flashcards: T[],
  currentId: string,
  baseOpts: DeckEditCardQueryState,
  currentUserId: string | null
): { position: number; total: number } | null {
  const { ordered, index } = orderedIndexForSaveNavigation(
    flashcards,
    currentId,
    baseOpts,
    currentUserId
  );
  if (index < 0) return null;
  return { position: index + 1, total: ordered.length };
}
