import { describe, expect, it } from "vitest";
import {
  applyStudyCardOrder,
  buildStudyCardSequence,
  createShuffleSequenceForEligible,
  findCardIndexById,
  isShuffleSequenceForEligible,
  orderCardsByIds,
  orderCardsByIdsStrict,
  sameEligibleIdSets,
  shuffleKeepingAnchorIndex,
  shuffleWithSeed,
} from "./study-card-order";

type Card = { id: string; n: number };

const fullDeck: Card[] = [
  { id: "a", n: 1 },
  { id: "b", n: 2 },
  { id: "c", n: 3 },
  { id: "d", n: 4 },
  { id: "e", n: 5 },
];

const savedOnly: Card[] = [
  { id: "b", n: 2 },
  { id: "d", n: 4 },
  { id: "e", n: 5 },
];

describe("filter first, then order — Saved only + Original", () => {
  it("preserves relative canonical order within saved subset", () => {
    const ordered = buildStudyCardSequence(savedOnly, "original", {
      shuffleSequenceIds: null,
      shuffleSeed: 1,
      shuffleAnchorIndex: 0,
    });
    expect(ordered.map((c) => c.id)).toEqual(["b", "d", "e"]);
  });
});

describe("filter first, then order — Saved only + Shuffle", () => {
  it("shuffles only the eligible saved subset", () => {
    const { ids, ordered } = createShuffleSequenceForEligible(savedOnly, 0, 42);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => savedOnly.some((c) => c.id === id))).toBe(true);
    expect(ordered[0]!.id).toBe("b");
    expect(isShuffleSequenceForEligible(savedOnly, ids)).toBe(true);
  });

  it("strict ordering never appends unsaved cards", () => {
    const fullShuffleIds = shuffleKeepingAnchorIndex(fullDeck, 0, 9).map(
      (c) => c.id,
    );
    const strict = orderCardsByIdsStrict(savedOnly, fullShuffleIds);
    expect(strict.length).toBe(3);
    expect(strict.every((c) => savedOnly.some((s) => s.id === c.id))).toBe(true);
    expect(new Set(strict.map((c) => c.id)).size).toBe(3);
    const loose = orderCardsByIds(savedOnly, fullShuffleIds);
    expect(loose.length).toBe(3);
    expect(loose.every((c) => savedOnly.some((s) => s.id === c.id))).toBe(true);
  });
});

describe("shuffle sequence validity", () => {
  it("detects when sequence does not match eligible set", () => {
    const ids = shuffleKeepingAnchorIndex(fullDeck, 0, 3).map((c) => c.id);
    expect(isShuffleSequenceForEligible(savedOnly, ids)).toBe(false);
    expect(isShuffleSequenceForEligible(savedOnly, ["b", "d", "e"])).toBe(true);
  });
});

describe("switching Saved only", () => {
  it("preserves current card when still eligible", () => {
    const visibleId = "d";
    const idxInSaved = findCardIndexById(savedOnly, visibleId);
    expect(idxInSaved).toBe(1);
    const { ids, anchorIndex } = createShuffleSequenceForEligible(
      savedOnly,
      idxInSaved,
      100,
    );
    expect(ids[anchorIndex]).toBe("d");
  });

  it("rebuilds shuffle when eligible set changes", () => {
    const first = createShuffleSequenceForEligible(savedOnly, 0, 50);
    const expanded = [...fullDeck];
    const second = createShuffleSequenceForEligible(expanded, 0, 50);
    expect(first.ids).not.toEqual(second.ids);
    expect(sameEligibleIdSets(first.ids, savedOnly.map((c) => c.id))).toBe(true);
  });
});

describe("counter uses filtered count", () => {
  it("active sequence length equals eligible count", () => {
    const seq = buildStudyCardSequence(savedOnly, "shuffle", {
      shuffleSequenceIds: createShuffleSequenceForEligible(savedOnly, 0, 7).ids,
      shuffleSeed: 7,
      shuffleAnchorIndex: 0,
    });
    expect(seq.length).toBe(3);
  });
});

describe("start from beginning does not reshuffle", () => {
  it("same seed and anchor yield same first card", () => {
    const a = createShuffleSequenceForEligible(savedOnly, 0, 88);
    const b = createShuffleSequenceForEligible(savedOnly, 0, 88);
    expect(a.ids[0]).toBe(b.ids[0]);
    expect(a.ids).toEqual(b.ids);
  });
});

describe("shuffleKeepingAnchorIndex", () => {
  it("keeps anchor card at anchor index (Card 1 stays Card 1)", () => {
    const shuffled = shuffleKeepingAnchorIndex(fullDeck, 0, 99);
    expect(shuffled[0]!.id).toBe("a");
  });

  it("does not mutate source", () => {
    const before = fullDeck.map((c) => c.id);
    shuffleKeepingAnchorIndex(fullDeck, 0, 7);
    expect(fullDeck.map((c) => c.id)).toEqual(before);
  });

  it("stable across rerenders (same seed)", () => {
    const a = shuffleKeepingAnchorIndex(savedOnly, 0, 12345);
    const b = shuffleKeepingAnchorIndex(savedOnly, 0, 12345);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });
});

describe("applyStudyCardOrder", () => {
  it("switching back to original restores canonical order", () => {
    const restored = applyStudyCardOrder(savedOnly, "original", 555);
    expect(restored.map((c) => c.id)).toEqual(["b", "d", "e"]);
  });
});

describe("findCardIndexById", () => {
  it("finds card in filtered set", () => {
    expect(findCardIndexById(savedOnly, "d")).toBe(1);
  });
});

describe("shuffleWithSeed", () => {
  it("is stable for the same seed", () => {
    const a = shuffleWithSeed(savedOnly, 1).map((c) => c.id);
    const b = shuffleWithSeed(savedOnly, 1).map((c) => c.id);
    expect(a).toEqual(b);
  });
});
