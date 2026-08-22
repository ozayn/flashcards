import { describe, expect, it } from "vitest";
import {
  buildStudyCardSequence,
  canonicalIdsFor,
  createShuffleSequenceForEligible,
  findCardIndexById,
  isCanonicalIdOrder,
  MOCK_SHUFFLE_IDS_ADBEC,
  orderCardsByIdsStrict,
  simulateStudyNavigation,
  studyNavigateNextIndex,
  studyNavigatePrevIndex,
} from "./study-card-order";

type Card = { id: string };

const canonical: Card[] = [
  { id: "A" },
  { id: "B" },
  { id: "C" },
  { id: "D" },
  { id: "E" },
];

describe("deterministic shuffle navigation A,D,B,E,C", () => {
  const shuffledIds = [...MOCK_SHUFFLE_IDS_ADBEC];

  it("shuffle ON: current=A, next=D, next=B, prev=D", () => {
    const path = simulateStudyNavigation(canonical, shuffledIds, 0, [
      "next",
      "next",
      "prev",
    ]);
    expect(path).toEqual(["A", "D", "B", "D"]);
    expect(path).not.toEqual(["A", "B", "C", "B"]);
  });

  it("buildStudyCardSequence uses explicit shuffle ids", () => {
    const active = buildStudyCardSequence(canonical, "shuffle", {
      shuffleSequenceIds: shuffledIds,
      shuffleSeed: 1,
      shuffleAnchorIndex: 0,
    });
    expect(active.map((c) => c.id)).toEqual(shuffledIds);
  });

  it("next/prev index helpers follow active sequence length", () => {
    const active = orderCardsByIdsStrict(canonical, shuffledIds);
    let i = 0;
    i = studyNavigateNextIndex(i, active.length);
    expect(active[i]!.id).toBe("D");
    i = studyNavigateNextIndex(i, active.length);
    expect(active[i]!.id).toBe("B");
    i = studyNavigatePrevIndex(i);
    expect(active[i]!.id).toBe("D");
  });
});

describe("navigation follows shuffled sequence", () => {
  it("next steps through shuffled order not canonical", () => {
    const ids = createShuffleSequenceForEligible(canonical, 0, 42).ids;
    expect(ids[0]).toBe("A");
    expect(isCanonicalIdOrder(ids, canonical)).toBe(false);

    const active = orderCardsByIdsStrict(canonical, ids);
    let index = 0;
    const visited: string[] = [active[index]!.id];

    index = studyNavigateNextIndex(index, active.length);
    visited.push(active[index]!.id);
    index = studyNavigateNextIndex(index, active.length);
    visited.push(active[index]!.id);

    expect(visited).toEqual([ids[0], ids[1], ids[2]]);
    expect(visited).not.toEqual(["A", "B", "C"]);
  });

  it("previous walks back along shuffled sequence", () => {
    const ids = createShuffleSequenceForEligible(canonical, 0, 42).ids;
    const active = orderCardsByIdsStrict(canonical, ids);
    let index = 2;
    const back: string[] = [active[index]!.id];
    index = studyNavigatePrevIndex(index);
    back.push(active[index]!.id);
    index = studyNavigatePrevIndex(index);
    back.push(active[index]!.id);
    expect(back).toEqual([ids[2], ids[1], ids[0]]);
  });

  it("counter position matches index in active sequence", () => {
    const ids = createShuffleSequenceForEligible(canonical, 0, 42).ids;
    const active = buildStudyCardSequence(canonical, "shuffle", {
      shuffleSequenceIds: ids,
      shuffleSeed: 42,
      shuffleAnchorIndex: 0,
    });
    const index = 2;
    expect(active[index]!.id).toBe(ids[2]);
    expect(index + 1).toBe(3);
    expect(active.length).toBe(5);
  });
});

describe("original mode uses canonical order", () => {
  it("active sequence equals eligible canonical order", () => {
    const active = buildStudyCardSequence(canonical, "original", {
      shuffleSequenceIds: null,
      shuffleSeed: 1,
      shuffleAnchorIndex: 0,
    });
    expect(active.map((c) => c.id)).toEqual(canonicalIdsFor(canonical));
  });
});

describe("canonical saved as shuffle is rejected", () => {
  it("buildStudyCardSequence ignores canonical shuffle ids", () => {
    const canonicalIds = canonicalIdsFor(canonical);
    const active = buildStudyCardSequence(canonical, "shuffle", {
      shuffleSequenceIds: canonicalIds,
      shuffleSeed: 99,
      shuffleAnchorIndex: 0,
    });
    expect(isCanonicalIdOrder(active.map((c) => c.id), canonical)).toBe(false);
  });
});

describe("saved only + shuffle", () => {
  const saved: Card[] = [{ id: "B" }, { id: "D" }, { id: "E" }];

  it("shuffles only saved subset", () => {
    const { ids } = createShuffleSequenceForEligible(saved, 0, 7);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => saved.some((c) => c.id === id))).toBe(true);
  });
});

describe("read/cards share sequence", () => {
  it("same ids produce identical activeStudyCards", () => {
    const ids = createShuffleSequenceForEligible(canonical, 0, 42).ids;
    const read = buildStudyCardSequence(canonical, "shuffle", {
      shuffleSequenceIds: ids,
      shuffleSeed: 42,
      shuffleAnchorIndex: 0,
    });
    const cards = buildStudyCardSequence(canonical, "shuffle", {
      shuffleSequenceIds: ids,
      shuffleSeed: 42,
      shuffleAnchorIndex: 0,
    });
    expect(read.map((c) => c.id)).toEqual(cards.map((c) => c.id));
  });
});

describe("switching modes preserves card when possible", () => {
  it("findCardIndexById locates visible card in new sequence", () => {
    const ids = createShuffleSequenceForEligible(canonical, 0, 42).ids;
    const active = orderCardsByIdsStrict(canonical, ids);
    const visibleId = ids[2];
    const idx = findCardIndexById(active, visibleId);
    expect(active[idx]!.id).toBe(visibleId);
  });
});

describe("start from beginning keeps shuffle", () => {
  it("index 0 of same ids is first card in shuffled permutation", () => {
    const ids = [...MOCK_SHUFFLE_IDS_ADBEC];
    const firstLoad = buildStudyCardSequence(canonical, "shuffle", {
      shuffleSequenceIds: ids,
      shuffleSeed: 88,
      shuffleAnchorIndex: 0,
    });
    const afterReset = buildStudyCardSequence(canonical, "shuffle", {
      shuffleSequenceIds: ids,
      shuffleSeed: 88,
      shuffleAnchorIndex: 0,
    });
    expect(firstLoad.map((c) => c.id)).toEqual(afterReset.map((c) => c.id));
    expect(afterReset[0]!.id).toBe("A");
  });
});

describe("rerender stability", () => {
  it("same shuffle ids yield same active sequence", () => {
    const ids = createShuffleSequenceForEligible(canonical, 0, 42).ids;
    const a = buildStudyCardSequence(canonical, "shuffle", {
      shuffleSequenceIds: ids,
      shuffleSeed: 42,
      shuffleAnchorIndex: 0,
    });
    const b = buildStudyCardSequence(canonical, "shuffle", {
      shuffleSequenceIds: ids,
      shuffleSeed: 42,
      shuffleAnchorIndex: 0,
    });
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });
});
