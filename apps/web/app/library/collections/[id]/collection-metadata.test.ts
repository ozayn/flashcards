import { describe, expect, it } from "vitest";
import {
  COLLECTION_METADATA_GENERIC_DESCRIPTION,
  COLLECTION_METADATA_GENERIC_TITLE,
  COLLECTION_METADATA_MAX_DESCRIPTION_LEN,
  COLLECTION_METADATA_MAX_TITLE_LEN,
  buildCollectionMetadataDescription,
  buildCollectionMetadataTitle,
  buildCollectionMetadataCountsSummary,
  truncateForCollectionMetadata,
} from "./collection-metadata";

describe("truncateForCollectionMetadata", () => {
  it("returns the input unchanged when within the cap", () => {
    expect(truncateForCollectionMetadata("hello", 20)).toBe("hello");
  });

  it("trims at a word boundary when one falls late enough in the slice", () => {
    const input = "alpha beta gamma delta epsilon zeta";
    const out = truncateForCollectionMetadata(input, 20);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out).not.toMatch(/\s…$/);
  });

  it("cuts hard with ellipsis when the first word alone exceeds the cap", () => {
    const out = truncateForCollectionMetadata("supercalifragilisticexpialidocious", 10);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("buildCollectionMetadataCountsSummary", () => {
  it("includes both deck and card counts when both are positive", () => {
    expect(buildCollectionMetadataCountsSummary(3, 42)).toBe(
      "3 decks · 42 cards · MemoNext",
    );
  });

  it("uses singular for one deck / one card", () => {
    expect(buildCollectionMetadataCountsSummary(1, 1)).toBe(
      "1 deck · 1 card · MemoNext",
    );
  });

  it("omits decks when only card count is known", () => {
    expect(buildCollectionMetadataCountsSummary(0, 12)).toBe("12 cards · MemoNext");
    expect(buildCollectionMetadataCountsSummary(null, 12)).toBe("12 cards · MemoNext");
  });

  it("omits cards when only deck count is known", () => {
    expect(buildCollectionMetadataCountsSummary(3, 0)).toBe("3 decks · MemoNext");
    expect(buildCollectionMetadataCountsSummary(3, null)).toBe("3 decks · MemoNext");
  });

  it("returns null when nothing is known", () => {
    expect(buildCollectionMetadataCountsSummary(0, 0)).toBeNull();
    expect(buildCollectionMetadataCountsSummary(null, null)).toBeNull();
  });
});

describe("buildCollectionMetadataTitle", () => {
  it("appends the MemoNext suffix to the collection title", () => {
    expect(buildCollectionMetadataTitle({ id: "1", title: "Spanish basics" })).toBe(
      "Spanish basics · MemoNext",
    );
  });

  it("falls back to the generic title when the title is missing or blank", () => {
    expect(buildCollectionMetadataTitle({ id: "1" })).toBe(
      COLLECTION_METADATA_GENERIC_TITLE,
    );
    expect(buildCollectionMetadataTitle({ id: "1", title: "" })).toBe(
      COLLECTION_METADATA_GENERIC_TITLE,
    );
    expect(buildCollectionMetadataTitle({ id: "1", title: "   " })).toBe(
      COLLECTION_METADATA_GENERIC_TITLE,
    );
  });

  it("keeps the combined title length within the configured cap", () => {
    const longTitle = "x".repeat(200);
    const title = buildCollectionMetadataTitle({ id: "1", title: longTitle });
    expect(title.endsWith(" · MemoNext")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(COLLECTION_METADATA_MAX_TITLE_LEN);
  });
});

describe("buildCollectionMetadataDescription", () => {
  it("prefers an explicit description over derived fallbacks", () => {
    expect(
      buildCollectionMetadataDescription({
        id: "1",
        description: "A short hand-written summary.",
        deck_count: 5,
        total_card_count: 90,
      }),
    ).toBe("A short hand-written summary.");
  });

  it("falls back to a counts summary when no description exists", () => {
    expect(
      buildCollectionMetadataDescription({
        id: "1",
        deck_count: 3,
        total_card_count: 42,
      }),
    ).toBe("3 decks · 42 cards · MemoNext");
  });

  it("falls back to deck-only counts when card count is missing or zero", () => {
    expect(
      buildCollectionMetadataDescription({ id: "1", deck_count: 4, total_card_count: 0 }),
    ).toBe("4 decks · MemoNext");
  });

  it("returns the generic description when nothing is known", () => {
    expect(buildCollectionMetadataDescription({ id: "1" })).toBe(
      COLLECTION_METADATA_GENERIC_DESCRIPTION,
    );
  });

  it("truncates very long descriptions for share-preview safety", () => {
    const long = "a ".repeat(300).trim();
    const out = buildCollectionMetadataDescription({ id: "1", description: long });
    expect(out.length).toBeLessThanOrEqual(COLLECTION_METADATA_MAX_DESCRIPTION_LEN);
    expect(out.endsWith("…")).toBe(true);
  });
});
