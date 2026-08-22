import { describe, expect, it } from "vitest";
import {
  buildShuffledIdsCurrentFirst,
  DEV_SHUFFLE_INDEX_PERM_5,
  MOCK_SHUFFLE_IDS_ADBEC,
  simulateStudyNavigation,
} from "./study-card-order";

describe("buildShuffledIdsCurrentFirst", () => {
  const ids = ["A", "B", "C", "D", "E"];

  it("dev deterministic five-card order matches A,D,B,E,C with current first", () => {
    const shuffled = buildShuffledIdsCurrentFirst(ids, "A", 1, true);
    expect(shuffled).toEqual([...MOCK_SHUFFLE_IDS_ADBEC]);
    const path = simulateStudyNavigation(
      ids.map((id) => ({ id })),
      shuffled,
      0,
      ["next", "next"],
    );
    expect(path).toEqual(["A", "D", "B"]);
  });

  it("puts current card at index 0 when not A", () => {
    const shuffled = buildShuffledIdsCurrentFirst(ids, "C", 1, true);
    expect(shuffled[0]).toBe("C");
    expect(shuffled.length).toBe(5);
    expect(new Set(shuffled).size).toBe(5);
  });

  it("DEV_SHUFFLE_INDEX_PERM_5 matches mock pattern for canonical ids", () => {
    const permuted = DEV_SHUFFLE_INDEX_PERM_5.map((i) => ids[i]);
    expect(permuted).toEqual(["A", "D", "B", "E", "C"]);
  });
});
