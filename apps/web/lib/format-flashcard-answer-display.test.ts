import { describe, expect, it } from "vitest";
import {
  applyExampleParagraphBreaks,
  buildAnswerDisplayText,
  parseAnswerParagraphs,
  shouldShowAnswerDetailed,
} from "./format-flashcard-answer-display";

describe("applyExampleParagraphBreaks", () => {
  it("splits inline Example: onto a new paragraph", () => {
    const s = applyExampleParagraphBreaks(
      "A monoid is a semigroup with identity. Example: natural numbers under addition."
    );
    expect(s).toContain("identity.\n\nExample:");
    expect(s).not.toMatch(/identity\. Example:/);
  });

  it("handles Examples: plural", () => {
    expect(applyExampleParagraphBreaks("Def. Examples: a, b, c.")).toContain(
      "Def.\n\nExamples:"
    );
  });

  it("does not add breaks when a blank line already precedes Example:", () => {
    const raw = "Definition line.\n\nExample: short.";
    expect(applyExampleParagraphBreaks(raw)).toBe(raw);
  });

  it("adds only one newline when already one newline before Example:", () => {
    const s = applyExampleParagraphBreaks("Definition line.\nExample: short.");
    expect(s).toBe("Definition line.\n\nExample: short.");
  });

  it("leaves Example: at the very start unchanged", () => {
    const raw = "Example: only this.";
    expect(applyExampleParagraphBreaks(raw)).toBe(raw);
  });

  it("does not match inside a longer word", () => {
    const raw = "Counterexample: see text.";
    expect(applyExampleParagraphBreaks(raw)).toBe(raw);
  });

  it("handles each Example: in long text", () => {
    const s = applyExampleParagraphBreaks(
      "First block. Example: A. More. Example: B."
    );
    expect(s).toContain("block.\n\nExample:");
    expect(s).toMatch(/A\. More\.\n\nExample:/);
  });
});

describe("parseAnswerParagraphs", () => {
  it("marks example paragraphs with abbreviated labels for display", () => {
    const blocks = parseAnswerParagraphs(
      "A short definition.\n\nExample: after one bad meal, someone overgeneralizes."
    );
    expect(blocks).toEqual([
      { type: "plain", text: "A short definition." },
      {
        type: "example",
        label: "Ex.",
        body: "after one bad meal, someone overgeneralizes.",
      },
    ]);
  });

  it("uses Exs. for Examples:", () => {
    const blocks = parseAnswerParagraphs("Intro.\n\nExamples: a, b.");
    expect(blocks[1]).toMatchObject({
      type: "example",
      label: "Exs.",
      body: "a, b.",
    });
  });

  it("does not treat Example inside Counterexample as an example block", () => {
    const blocks = parseAnswerParagraphs("See Counterexample: here.");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "plain", text: "See Counterexample: here." });
  });
});

describe("buildAnswerDisplayText", () => {
  it("returns only core when no example", () => {
    expect(buildAnswerDisplayText("Core def.", null)).toBe("Core def.");
  });

  it("prefixes Example when only example is set", () => {
    expect(buildAnswerDisplayText("", "e.g. usage")).toBe("Example:\ne.g. usage");
  });

  it("joins core and example with blank line", () => {
    expect(buildAnswerDisplayText("A monoid is …", "ℕ under +")).toContain(
      "A monoid is …\n\nExample:\n"
    );
  });
});

describe("shouldShowAnswerDetailed", () => {
  it("hides when detailed duplicates core or example or full composed answer", () => {
    expect(shouldShowAnswerDetailed("", "a", null)).toBe(false);
    expect(shouldShowAnswerDetailed("a", "a", null)).toBe(false);
    expect(shouldShowAnswerDetailed("ex", "a", "ex")).toBe(false);
    expect(
      shouldShowAnswerDetailed(
        buildAnswerDisplayText("a", "b"),
        "a",
        "b"
      )
    ).toBe(false);
  });

  it("shows when detailed is distinct notes", () => {
    expect(shouldShowAnswerDetailed("Extra notes only here", "def", null)).toBe(true);
  });
});
