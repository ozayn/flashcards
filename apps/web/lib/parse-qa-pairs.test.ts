import { describe, expect, it } from "vitest";
import { parseQAPairs } from "./parse-qa-pairs";

describe("parseQAPairs", () => {
  it("does not leak Card N headings into the previous answer (regression)", () => {
    const text = `Card 1
Q: First question?
A: First answer

Card 2
Q: Second question?
A: Second answer only

Card 3
Q: Third?
A: Third answer`;

    const pairs = parseQAPairs(text);
    expect(pairs).not.toBeNull();
    expect(pairs).toHaveLength(3);
    expect(pairs![0]!.question).toBe("First question?");
    expect(pairs![0]!.answer_short).toBe("First answer");
    expect(pairs![0]!.answer_short).not.toMatch(/Card\s*2/i);
    expect(pairs![1]!.question).toBe("Second question?");
    expect(pairs![1]!.answer_short).toBe("Second answer only");
    expect(pairs![1]!.answer_short).not.toMatch(/Card\s*3/i);
    expect(pairs![2]!.answer_short).toBe("Third answer");
  });

  it("supports multi-digit Card headings and optional colon", () => {
    const text = `Card 10
Q: Q10
A: A10

Card 11:
Q: Q11
A: A11`;

    const pairs = parseQAPairs(text);
    expect(pairs).not.toBeNull();
    expect(pairs).toHaveLength(2);
    expect(pairs![0]!.answer_short).toBe("A10");
    expect(pairs![1]!.answer_short).toBe("A11");
  });

  it("preserves multiline answers until the next card boundary", () => {
    const text = `Card 1
Q: Q
A: Line one
line two


Card 2
Q: Q2
A: B`;

    const pairs = parseQAPairs(text);
    expect(pairs).not.toBeNull();
    expect(pairs![0]!.answer_short).toContain("Line one");
    expect(pairs![0]!.answer_short).toContain("line two");
    expect(pairs![0]!.answer_short).not.toMatch(/Card\s*2/i);
    expect(pairs![1]!.answer_short).toBe("B");
  });

  it("still parses classic Q:/A: pairs without Card headings", () => {
    const text = `Q: One
A: Alpha

Q: Two
A: Beta`;

    const pairs = parseQAPairs(text);
    expect(pairs).not.toBeNull();
    expect(pairs).toHaveLength(2);
    expect(pairs![0]!.question).toBe("One");
    expect(pairs![1]!.answer_short).toBe("Beta");
  });

  it("parses a single Q:/A: card", () => {
    const pairs = parseQAPairs(`Q: What is a pandas DataFrame?
A: A pandas DataFrame is a table-like data structure with rows and columns.`);
    expect(pairs).not.toBeNull();
    expect(pairs).toHaveLength(1);
    expect(pairs![0]!.question).toBe("What is a pandas DataFrame?");
    expect(pairs![0]!.answer_short).toContain("table-like");
  });

  it("returns null when there is no complete pair", () => {
    expect(parseQAPairs("Q: Only a question")).toBeNull();
    expect(parseQAPairs("A: Only an answer")).toBeNull();
    expect(parseQAPairs("")).toBeNull();
  });

  it("splits Example: into answer_example (regression: re-import / paste Q&A)", () => {
    const text = `Q: What is photosynthesis?
A: Plants convert light to chemical energy.

Example:
A leaf absorbing sunlight.

Q: Second card?
A: Short answer only.`;

    const pairs = parseQAPairs(text);
    expect(pairs).not.toBeNull();
    expect(pairs).toHaveLength(2);
    expect(pairs![0]!.answer_short).toBe(
      "Plants convert light to chemical energy."
    );
    expect(pairs![0]!.answer_example).toBe("A leaf absorbing sunlight.");
    expect(pairs![1]!.answer_short).toBe("Short answer only.");
    expect(pairs![1]!.answer_example).toBeUndefined();
  });

  it("splits same-line A: ... Example: ... into answer_example", () => {
    const text = `Q: One
A: Paris is the capital. Example: It hosts the Louvre.

Q: Two
A: Beta`;

    const pairs = parseQAPairs(text);
    expect(pairs).not.toBeNull();
    expect(pairs![0]!.answer_short).toBe("Paris is the capital.");
    expect(pairs![0]!.answer_example).toBe("It hosts the Louvre.");
  });
});
