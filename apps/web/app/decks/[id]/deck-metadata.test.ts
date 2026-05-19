import { describe, expect, it } from "vitest";
import {
  DECK_METADATA_GENERIC_DESCRIPTION,
  DECK_METADATA_GENERIC_TITLE,
  DECK_METADATA_MAX_DESCRIPTION_LEN,
  DECK_METADATA_MAX_TITLE_LEN,
  buildDeckMetadataDescription,
  buildDeckMetadataTitle,
  truncateForDeckMetadata,
} from "./deck-metadata";

describe("truncateForDeckMetadata", () => {
  it("returns the input unchanged when within the cap", () => {
    expect(truncateForDeckMetadata("short", 20)).toBe("short");
  });

  it("trims at a word boundary when one falls late enough in the slice", () => {
    const input = "alpha beta gamma delta epsilon zeta";
    const out = truncateForDeckMetadata(input, 20);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out).not.toMatch(/\s…$/);
  });

  it("cuts hard with ellipsis when the first word alone exceeds the cap (no usable boundary)", () => {
    const out = truncateForDeckMetadata("supercalifragilisticexpialidocious", 10);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.endsWith("…")).toBe(true);
  });

  it("strips surrounding whitespace before measuring", () => {
    expect(truncateForDeckMetadata("   hello world   ", 50)).toBe("hello world");
  });
});

describe("buildDeckMetadataTitle", () => {
  it("uses the deck name with the MemoNext suffix", () => {
    expect(buildDeckMetadataTitle({ id: "1", name: "Spanish Verbs" })).toBe(
      "Spanish Verbs · MemoNext"
    );
  });

  it("falls back to the generic title when the name is missing or blank", () => {
    expect(buildDeckMetadataTitle({ id: "1" })).toBe(DECK_METADATA_GENERIC_TITLE);
    expect(buildDeckMetadataTitle({ id: "1", name: "" })).toBe(DECK_METADATA_GENERIC_TITLE);
    expect(buildDeckMetadataTitle({ id: "1", name: "   " })).toBe(DECK_METADATA_GENERIC_TITLE);
  });

  it("keeps the combined title length within the configured cap", () => {
    const longName = "x".repeat(200);
    const title = buildDeckMetadataTitle({ id: "1", name: longName });
    expect(title.endsWith(" · MemoNext")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(DECK_METADATA_MAX_TITLE_LEN);
  });
});

describe("buildDeckMetadataDescription", () => {
  it("prefers an explicit description over derived fallbacks", () => {
    expect(
      buildDeckMetadataDescription({
        id: "1",
        description: "Short hand-written deck description.",
        card_count: 12,
        source_topic: "Photosynthesis",
      })
    ).toBe("Short hand-written deck description.");
  });

  it("falls back to topic + card count when no description exists", () => {
    expect(
      buildDeckMetadataDescription({
        id: "1",
        source_topic: "Photosynthesis",
        card_count: 12,
      })
    ).toBe("Flashcards on Photosynthesis · 12 cards on MemoNext");
  });

  it("uses singular 'card' for a one-card deck", () => {
    expect(
      buildDeckMetadataDescription({ id: "1", card_count: 1 })
    ).toBe("1 card on MemoNext");
  });

  it("falls back to source_summary when there is no description and no topic", () => {
    expect(
      buildDeckMetadataDescription({
        id: "1",
        source_summary: "A summary of the underlying article.",
      })
    ).toBe("A summary of the underlying article.");
  });

  it("falls back to card count alone when nothing else is available", () => {
    expect(buildDeckMetadataDescription({ id: "1", card_count: 24 })).toBe(
      "24 cards on MemoNext"
    );
  });

  it("falls back to the generic description when nothing is known", () => {
    expect(buildDeckMetadataDescription({ id: "1" })).toBe(DECK_METADATA_GENERIC_DESCRIPTION);
  });

  it("truncates very long descriptions for share-preview safety", () => {
    const long = "a ".repeat(300).trim();
    const out = buildDeckMetadataDescription({ id: "1", description: long });
    expect(out.length).toBeLessThanOrEqual(DECK_METADATA_MAX_DESCRIPTION_LEN);
    expect(out.endsWith("…")).toBe(true);
  });
});
