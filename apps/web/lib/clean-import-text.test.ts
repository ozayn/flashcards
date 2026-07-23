import { describe, expect, it } from "vitest";
import { cleanImportText } from "./clean-import-text";
import { parseDeckTextImport } from "./parse-deck-text-import";
import { parseQAPairs } from "./parse-qa-pairs";

describe("cleanImportText", () => {
  it("removes dashed / equals separator lines and keeps Q:/A:", () => {
    const input = `--------------------------------------------------
Q: What is spectroscopy?
A: The study of the interaction between matter and electromagnetic radiation.

--------------------------------------------------
`;
    expect(cleanImportText(input)).toBe(
      `Q: What is spectroscopy?\nA: The study of the interaction between matter and electromagnetic radiation.`,
    );
  });

  it("removes -, =, _, *, ~, # separator-only lines (with surrounding whitespace)", () => {
    const input = [
      "  ------------------------  ",
      "Q: One",
      "A: Alpha",
      "",
      "",
      "========================",
      "____________",
      "************",
      "~~~~~~~~~~~~",
      "############",
      "Q: Two",
      "A: Beta",
    ].join("\n");
    expect(cleanImportText(input)).toBe(`Q: One\nA: Alpha\n\nQ: Two\nA: Beta`);
  });

  it("collapses multiple blank lines and trims each line", () => {
    const input = `  Q: Trim me  
A:  Keep interior   spaces  

\t

Q: Next
A: End  `;
    expect(cleanImportText(input)).toBe(
      `Q: Trim me\nA:  Keep interior   spaces\n\nQ: Next\nA: End`,
    );
  });

  it("preserves dashed dividers when preserveDashedDividers is true", () => {
    const input = `Title
====
--------------------------------------------------
1. Q?
A
--------------------------------------------------
****
`;
    expect(cleanImportText(input, { preserveDashedDividers: true })).toBe(
      `Title\n--------------------------------------------------\n1. Q?\nA\n--------------------------------------------------`,
    );
  });
});

describe("import pipeline ignores separator artifacts", () => {
  it("parseDeckTextImport drops separators around Q:/A: cards", () => {
    const text = `--------------------------------------------------
Q: What is spectroscopy?
A: Study of light and matter.

--------------------------------------------------
Q: What is absorbance?
A: How much light a sample absorbs.
========================
`;
    const r = parseDeckTextImport(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.format).toBe("strict");
      expect(r.pairs).toHaveLength(2);
      expect(r.pairs[0]!.question).toBe("What is spectroscopy?");
      expect(r.pairs[0]!.answer_short).toBe("Study of light and matter.");
      expect(r.pairs[1]!.question).toBe("What is absorbance?");
      expect(r.pairs.map((p) => p.question).join(" ")).not.toMatch(/-/);
      expect(r.pairs.map((p) => p.answer_short).join(" ")).not.toContain("---");
    }
  });

  it("separator-only input never yields flashcards", () => {
    const onlySeps = `--------------------------------------------------
------------------------
========================
____________
`;
    expect(cleanImportText(onlySeps)).toBe("");
    expect(parseQAPairs(onlySeps)).toBeNull();
    const r = parseDeckTextImport(onlySeps);
    expect(r.ok).toBe(false);
  });

  it("does not append separator lines into answer text", () => {
    const text = `Q: Term
A: Definition line
--------------------------------------------------
still part of answer without the dashes above
`;
    const pairs = parseQAPairs(text);
    expect(pairs).toHaveLength(1);
    expect(pairs![0]!.answer_short).toBe(
      "Definition line\nstill part of answer without the dashes above",
    );
    expect(pairs![0]!.answer_short).not.toContain("-");
  });

  it("still re-imports deck export format that uses dashed dividers", () => {
    const t = `My Deck
Cards: 1

--------------------------------------------------
1. What is X?

Core answer.
--------------------------------------------------
`;
    const r = parseDeckTextImport(t);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.format).toBe("export");
      expect(r.pairs).toHaveLength(1);
      expect(r.pairs[0]!.question).toBe("What is X?");
      expect(r.pairs[0]!.answer_short).toBe("Core answer.");
    }
  });
});
