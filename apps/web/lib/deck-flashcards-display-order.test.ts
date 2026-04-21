import { describe, expect, it } from "vitest";
import {
  buildDeckEditCardQuerySuffix,
  orderDeckFlashcardsForDisplay,
  parseDeckEditCardQuery,
} from "./deck-flashcards-display-order";

const cards = [
  { id: "1", question: "B", answer_short: "b" },
  { id: "2", question: "A", answer_short: "a" },
];

describe("orderDeckFlashcardsForDisplay", () => {
  it("sorts A–Z by question", () => {
    const out = orderDeckFlashcardsForDisplay(cards, {
      cardSort: "az",
      cardSearch: "",
      cardBookmarkFilter: "all",
      currentUserId: null,
    });
    expect(out.map((c) => c.id)).toEqual(["2", "1"]);
  });

  it("reverses for oldest", () => {
    const out = orderDeckFlashcardsForDisplay(cards, {
      cardSort: "oldest",
      cardSearch: "",
      cardBookmarkFilter: "all",
      currentUserId: null,
    });
    expect(out.map((c) => c.id)).toEqual(["2", "1"]);
  });
});

describe("buildDeckEditCardQuerySuffix / parseDeckEditCardQuery", () => {
  it("round-trips sort and q", () => {
    const s = buildDeckEditCardQuerySuffix({
      sort: "az",
      q: "hello world",
      bookmarked: "all",
    });
    expect(s).toContain("sort=az");
    expect(s).toContain("q=");
    const parsed = parseDeckEditCardQuery(new URLSearchParams(s.slice(1)));
    expect(parsed.cardSort).toBe("az");
    expect(parsed.cardSearch).toBe("hello world");
  });
});
