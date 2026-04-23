import { describe, expect, it } from "vitest";
import { parseDeckTextImport, parseExportFormat, looksLikeExportFormat } from "./parse-deck-text-import";
import { parseQAPairs } from "./parse-qa-pairs";

describe("looksLikeExportFormat", () => {
  it("is true for dashed + numbered + optional Cards line", () => {
    const t = `T\nCategory: A\n\n--------------------------------------------------\n1. Q1?\nA1\n\n--------------------------------------------------\n2. Q2\nA2\n\n--------------------------------------------------\n`;
    expect(looksLikeExportFormat(t)).toBe(true);
  });
  it("is false for strict Q: / A: only", () => {
    expect(looksLikeExportFormat("Q: x\nA: y\n")).toBe(false);
  });
  it("is false without a numbered question line", () => {
    expect(looksLikeExportFormat("A\nB\nC\n--------------------------------------------------\n")).toBe(false);
  });
});

describe("parseDeckTextImport (strict, regression)", () => {
  it("still imports classic Q: / A:", () => {
    const text = `Q: One
A: Alpha

Q: Two
A: Beta`;
    const r = parseDeckTextImport(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.format).toBe("strict");
      expect(r.pairs).toHaveLength(2);
      expect(r.pairs[0]!.question).toBe("One");
      expect(r.pairs[1]!.answer_short).toBe("Beta");
    }
  });

  it("matches existing parseQAPairs for strict", () => {
    const t = `Q: Q
A: multi
line
Example:
exx`;
    const r = parseDeckTextImport(t);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pairs).toEqual(parseQAPairs(t));
    }
  });
});

describe("parseExportFormat and parseDeckTextImport (export style)", () => {
  it("imports the documented sample with metadata and a card", () => {
    const t = `"YOU WILL OWN NOTHING"
Category: History
Source: YouTube
Source URL: https://www.youtube.com/watch?v=hIhWnurBzB4
Cards: 8

--------------------------------------------------
1. According to the text, what is the First Sale Doctrine and how does it apply to digital purchases?

The First Sale Doctrine protects the right to resell physical goods that you buy. However, courts have ruled that this doctrine does not apply to digital purchases.
--------------------------------------------------
`;
    expect(looksLikeExportFormat(t)).toBe(true);
    const r = parseDeckTextImport(t);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.format).toBe("export");
      expect(r.pairs).toHaveLength(1);
      expect(r.pairs[0]!.question).toContain("First Sale Doctrine");
      expect(r.pairs[0]!.answer_short).toContain("resell physical goods");
      expect(r.metadata?.title).toMatch(/OWN NOTHING/i);
      expect(r.metadata?.category).toBe("History");
      expect(r.metadata?.source).toBe("YouTube");
      expect(r.metadata?.sourceUrl).toContain("youtube.com");
      expect(r.metadata?.cardsCountLine).toBe(8);
    }
  });

  it("splits Definition and Example in export body", () => {
    const t = `DECK
Cards: 1

--------------------------------------------------
1. What is X?

Definition:
Core text here.

Example:
A concrete example.
--------------------------------------------------
`;
    const p = parseExportFormat(t);
    expect(p.pairs).toHaveLength(1);
    expect(p.pairs[0]!.question).toBe("What is X?");
    expect(p.pairs[0]!.answer_short).toBe("Core text here.");
    expect(p.pairs[0]!.answer_example).toContain("concrete");
  });

  it("splits short + Example: block (answer_example field style)", () => {
    const t = `C

--------------------------------------------------
1. Q1?

The short.
Example:
ex line
--------------------------------------------------
`;
    const p = parseExportFormat(t);
    expect(p.pairs[0]!.answer_short).toBe("The short.");
    expect(p.pairs[0]!.answer_example).toBe("ex line");
  });

  it("parses More detail into answer_detailed", () => {
    const t = `A

--------------------------------------------------
1. Qq?

Body line.

More detail:
Extra long notes.
--------------------------------------------------
`;
    const p = parseExportFormat(t);
    expect(p.pairs[0]!.answer_short).toBe("Body line.");
    expect(p.pairs[0]!.answer_detailed).toContain("Extra long");
  });
});

describe("malformed input", () => {
  it("fails for gibberish", () => {
    const r = parseDeckTextImport("hello\nworld");
    expect(r.ok).toBe(false);
  });

  it("fails when a numbered line exists and dividers exist but no line starts a card block", () => {
    const t = `Preamble text
1. A numbered line that is not the first line of a chunk
--------------------------------------------------
First line is not
--------------------------------------------------`;
    expect(looksLikeExportFormat(t)).toBe(true);
    const r = parseDeckTextImport(t);
    expect(r.ok).toBe(false);
  });

  it("does not return strict parse when export is expected and broken", () => {
    const t = `X

--------------------------------------------------
Not numbered
--------------------------------------------------`;
    const r = parseDeckTextImport(t);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.length).toBeGreaterThan(20);
    }
  });
});
