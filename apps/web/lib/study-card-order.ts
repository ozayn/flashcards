/**
 * Client-side study card ordering (Original vs Shuffle).
 * Does not modify deck storage or API order.
 */

export type StudyCardOrder = "original" | "shuffle";

const PREFERENCE_KEY = "flashcards_study_card_order_preference_v1";

/** Seeded PRNG (mulberry32) for stable shuffle permutations within a session. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function clampStudyIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(Math.floor(index), length - 1));
}

/**
 * Fisher–Yates shuffle with a numeric seed. Returns a new array; never mutates `items`.
 */
export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  if (result.length <= 1) return result;
  const random = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = result[i];
    result[i] = result[j]!;
    result[j] = tmp!;
  }
  return result;
}

/**
 * Shuffle while keeping the card at `anchorIndex` fixed at that position.
 * Other cards fill the remaining slots in a seeded random order.
 */
export function shuffleKeepingAnchorIndex<T>(
  items: readonly T[],
  anchorIndex: number,
  seed: number,
): T[] {
  if (items.length <= 1) return [...items];
  const idx = clampStudyIndex(anchorIndex, items.length);
  const anchor = items[idx];
  const rest = items.filter((_, i) => i !== idx);
  const shuffledRest = shuffleWithSeed(rest, seed);
  const result: T[] = [];
  let restPtr = 0;
  for (let i = 0; i < items.length; i++) {
    if (i === idx) {
      result.push(anchor);
    } else {
      result.push(shuffledRest[restPtr++]!);
    }
  }
  return result;
}

export function applyStudyCardOrder<T>(
  items: readonly T[],
  order: StudyCardOrder,
  seed: number,
  shuffleAnchorIndex = 0,
): T[] {
  if (order === "shuffle") {
    return shuffleKeepingAnchorIndex(items, shuffleAnchorIndex, seed);
  }
  return [...items];
}

/** Reorder `items` by `ids`; unknown ids omitted; unmatched `items` appended in canonical order. */
export function orderCardsByIds<T extends { id: string }>(
  items: readonly T[],
  ids: readonly string[],
): T[] {
  const byId = new Map(items.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const result: T[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const card = byId.get(id);
    if (card) {
      result.push(card);
      seen.add(id);
    }
  }
  for (const card of items) {
    if (!seen.has(card.id)) {
      result.push(card);
    }
  }
  return result;
}

/** Reorder `items` by `ids` only — no extra cards (shuffle / filtered subsets). */
export function orderCardsByIdsStrict<T extends { id: string }>(
  items: readonly T[],
  ids: readonly string[],
): T[] {
  const byId = new Map(items.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const result: T[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const card = byId.get(id);
    if (card) {
      result.push(card);
      seen.add(id);
    }
  }
  return result;
}

export function sameEligibleIdSets(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  if (setA.size !== a.length) return false;
  for (const id of b) {
    if (!setA.has(id)) return false;
  }
  return true;
}

/** True when `sequenceIds` is a permutation of the eligible card ids (no extras). */
export function isShuffleSequenceForEligible(
  eligible: readonly { id: string }[],
  sequenceIds: readonly string[] | null,
): boolean {
  if (!sequenceIds || sequenceIds.length === 0) {
    return eligible.length === 0;
  }
  if (sequenceIds.length !== eligible.length) return false;
  const eligibleSet = new Set(eligible.map((c) => c.id));
  const seen = new Set<string>();
  for (const id of sequenceIds) {
    if (!eligibleSet.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return seen.size === eligible.length;
}

export function createShuffleSequenceForEligible<T extends { id: string }>(
  eligible: readonly T[],
  anchorIndex: number,
  seed: number,
): { ordered: T[]; ids: string[]; anchorIndex: number } {
  const anchor = clampStudyIndex(anchorIndex, eligible.length);
  const ordered = shuffleKeepingAnchorIndex(eligible, anchor, seed);
  return {
    ordered,
    ids: ordered.map((c) => c.id),
    anchorIndex: anchor,
  };
}

export function buildStudyCardSequence<T extends { id: string }>(
  items: readonly T[],
  order: StudyCardOrder,
  options: {
    shuffleSequenceIds: string[] | null;
    shuffleSeed: number;
    shuffleAnchorIndex: number;
  },
): T[] {
  if (order !== "shuffle") {
    return [...items];
  }
  if (items.length <= 1) {
    return [...items];
  }

  const ids = options.shuffleSequenceIds;
  const idsValid =
    ids &&
    ids.length > 0 &&
    isShuffleSequenceForEligible(items, ids) &&
    !isCanonicalIdOrder(ids, items);

  if (idsValid) {
    return orderCardsByIdsStrict(items, ids);
  }

  const anchor = clampStudyIndex(options.shuffleAnchorIndex, items.length);
  let seed = options.shuffleSeed;
  let ordered = shuffleKeepingAnchorIndex(items, anchor, seed);
  let attempts = 0;
  while (
    items.length > 2 &&
    isCanonicalIdOrder(ordered.map((c) => c.id), items) &&
    attempts < 16
  ) {
    attempts += 1;
    seed += 1;
    ordered = shuffleKeepingAnchorIndex(items, anchor, seed);
  }
  return ordered;
}

/** Next index along the active study sequence (clamped). */
export function studyNavigateNextIndex(
  currentIndex: number,
  length: number,
): number {
  if (length <= 0) return 0;
  return Math.min(currentIndex + 1, length - 1);
}

/** Previous index along the active study sequence (clamped). */
export function studyNavigatePrevIndex(currentIndex: number): number {
  return Math.max(currentIndex - 1, 0);
}

/**
 * Deterministic navigation walk for tests: returns card ids visited including start.
 */
export function simulateStudyNavigation(
  canonical: readonly { id: string }[],
  sequenceIds: readonly string[],
  startIndex: number,
  steps: readonly ("next" | "prev")[],
): string[] {
  const sequence = orderCardsByIdsStrict(canonical, sequenceIds);
  let index = clampStudyIndex(startIndex, sequence.length);
  const path: string[] = [sequence[index]!.id];
  for (const step of steps) {
    index =
      step === "next"
        ? studyNavigateNextIndex(index, sequence.length)
        : studyNavigatePrevIndex(index);
    path.push(sequence[index]!.id);
  }
  return path;
}

/** Fixed permutation for deterministic shuffle navigation tests. */
export const MOCK_SHUFFLE_IDS_ADBEC = ["A", "D", "B", "E", "C"] as const;

/** Dev-only: permute first 5 eligible ids to match MOCK_SHUFFLE_IDS_ADBEC pattern by index. */
export const DEV_SHUFFLE_INDEX_PERM_5 = [0, 3, 1, 4, 2] as const;

/**
 * Shuffle eligible ids with the visible card fixed at index 0:
 * `[currentId, ...shuffledRemaining]`.
 */
export function buildShuffledIdsCurrentFirst(
  eligibleIds: readonly string[],
  currentId: string | undefined,
  seed: number,
  devDeterministicFiveCard = false,
): string[] {
  if (eligibleIds.length <= 1) return [...eligibleIds];
  const current =
    currentId && eligibleIds.includes(currentId) ? currentId : eligibleIds[0]!;
  const rest = eligibleIds.filter((id) => id !== current);
  if (rest.length === 0) return [current];

  let shuffledRest: string[];
  if (devDeterministicFiveCard && eligibleIds.length === 5) {
    const permuted = DEV_SHUFFLE_INDEX_PERM_5.map((i) => eligibleIds[i]!);
    shuffledRest = permuted.filter((id) => id !== current);
    return [current, ...shuffledRest];
  }

  shuffledRest = shuffleWithSeed([...rest], seed);
  return [current, ...shuffledRest];
}

export function readStudyCardOrderPreference(): StudyCardOrder {
  if (typeof window === "undefined") return "original";
  try {
    const raw = window.localStorage.getItem(PREFERENCE_KEY);
    return raw === "shuffle" ? "shuffle" : "original";
  } catch {
    return "original";
  }
}

export function writeStudyCardOrderPreference(order: StudyCardOrder): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERENCE_KEY, order);
  } catch {
    // quota / private mode
  }
}

export function findCardIndexById<T extends { id: string }>(
  cards: readonly T[],
  cardId: string | undefined,
): number {
  if (!cardId) return -1;
  return cards.findIndex((c) => c.id === cardId);
}

/** True when `sequenceIds` match canonical eligible order exactly. */
export function isCanonicalIdOrder(
  sequenceIds: readonly string[],
  canonical: readonly { id: string }[],
): boolean {
  if (sequenceIds.length !== canonical.length) return false;
  for (let i = 0; i < sequenceIds.length; i++) {
    if (sequenceIds[i] !== canonical[i]?.id) return false;
  }
  return true;
}

export function canonicalIdsFor<T extends { id: string }>(
  items: readonly T[],
): string[] {
  return items.map((c) => c.id);
}
