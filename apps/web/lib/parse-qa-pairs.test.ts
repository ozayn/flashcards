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

  it("returns null when fewer than two cards", () => {
    expect(
      parseQAPairs(`Card 1
Q: Only
A: One`)
    ).toBeNull();
  });
});
