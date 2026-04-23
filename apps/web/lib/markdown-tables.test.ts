import { describe, expect, it } from "vitest";
import {
  isDelimiterRow,
  parseTableRow,
  splitTextAndGfmTables,
  tryParseGfmTableAt,
} from "./markdown-tables";

const confusionMatrix = `|                | Predicted Positive | Predicted Negative |
|----------------|--------------------|--------------------|
| Actual Positive| True Positive      | False Negative     |
| Actual Negative| False Positive     | True Negative      |`;

describe("isDelimiterRow", () => {
  it("accepts a standard GFM alignment row", () => {
    expect(isDelimiterRow("|----------------|--------------------|--------------------|")).toBe(true);
    expect(isDelimiterRow("| --- | --- | --- |")).toBe(true);
  });

  it("rejects pipe-only lines and prose", () => {
    expect(isDelimiterRow("| a | b |")).toBe(false);
    expect(isDelimiterRow("not a table")).toBe(false);
  });
});

describe("parseTableRow", () => {
  it("splits on pipes and trims", () => {
    expect(parseTableRow("|  a  |  b  |")).toEqual(["a", "b"]);
    expect(parseTableRow("| A | B | C |")).toEqual(["A", "B", "C"]);
  });
});

describe("tryParseGfmTableAt", () => {
  it("parses a confusion matrix starting at line 0", () => {
    const lines = confusionMatrix.split("\n");
    const r = tryParseGfmTableAt(lines, 0);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.header).toEqual(["", "Predicted Positive", "Predicted Negative"]);
    expect(r.body).toHaveLength(2);
    expect(r.body[0]![0]).toBe("Actual Positive");
    expect(r.body[0]![1]).toBe("True Positive");
    expect(r.endLine).toBe(4);
  });
});

describe("splitTextAndGfmTables", () => {
  it("extracts a valid GFM table as a single table segment", () => {
    const s = splitTextAndGfmTables(confusionMatrix);
    expect(s).toHaveLength(1);
    expect(s[0]?.kind).toBe("table");
    if (s[0]?.kind === "table") {
      expect(s[0].header[1]).toBe("Predicted Positive");
    }
  });

  it("returns plain text for malformed / incomplete tables (no crash)", () => {
    const bad = "Here is a broken spec\n| col |\n| x | y |\n| z |";
    const s = splitTextAndGfmTables(bad);
    expect(s).toEqual([{ kind: "text", value: bad }]);
  });

  it("handles prose before and after a table in one string", () => {
    const raw = `This is a label.

| H1 | H2 |
|----|----|
| C1 | C2 |

The paragraph after.`;
    const s = splitTextAndGfmTables(raw);
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s[0]?.kind).toBe("text");
    if (s[0]?.kind === "text") {
      expect(s[0].value.trim()).toBe("This is a label.");
    }
    expect(s[1]?.kind).toBe("table");
    if (s[1]?.kind === "table") {
      expect(s[1].header).toEqual(["H1", "H2"]);
      expect(s[1].body).toEqual([["C1", "C2"]]);
    }
    const last = s[s.length - 1]!;
    expect(last.kind).toBe("text");
    if (last.kind === "text") {
      expect(last.value.trim().startsWith("The paragraph after")).toBe(true);
    }
  });

  it("fails open to one text block on pathological input", () => {
    const t = "plain";
    const s = splitTextAndGfmTables(t);
    expect(s).toEqual([{ kind: "text", value: t }]);
  });
});
