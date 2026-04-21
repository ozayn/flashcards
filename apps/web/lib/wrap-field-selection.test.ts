import { describe, expect, it } from "vitest";
import { buildFencedCodeBlockWrap } from "./wrap-field-selection";

describe("buildFencedCodeBlockWrap", () => {
  it("wraps selection with opening and closing fences on separate lines", () => {
    const value = "hello";
    const { next, selStart, selEnd } = buildFencedCodeBlockWrap(value, 0, 5);
    expect(next).toBe("```\nhello\n```");
    expect(selStart).toBe(4);
    expect(selEnd).toBe(9);
  });

  it("preserves multiline selection", () => {
    const inner = "a\nb";
    const value = `x${inner}y`;
    const { next, selStart, selEnd } = buildFencedCodeBlockWrap(value, 1, 1 + inner.length);
    expect(next).toBe("x```\na\nb\n```y");
    expect(next.slice(selStart, selEnd)).toBe(inner);
  });

  it("inserts empty fenced block and collapses caret inside", () => {
    const value = "ab";
    const { next, selStart, selEnd } = buildFencedCodeBlockWrap(value, 1, 1);
    expect(next).toBe("a```\n\n```b");
    expect(selStart).toBe(selEnd);
    expect(selStart).toBe(5);
  });
});
