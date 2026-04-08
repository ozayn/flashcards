import { describe, expect, it } from "vitest";
import {
  parseBoldSegments,
  parseInlineMarkdownTree,
  parseItalicSegments,
} from "./inline-markdown";

describe("parseBoldSegments", () => {
  it("extracts **bold**", () => {
    expect(parseBoldSegments("a **b** c")).toEqual([
      { type: "text", value: "a " },
      { type: "bold", value: "b" },
      { type: "text", value: " c" },
    ]);
  });

  it("leaves unclosed ** as text", () => {
    expect(parseBoldSegments("x **open")).toEqual([
      { type: "text", value: "x " },
      { type: "text", value: "**open" },
    ]);
  });
});

describe("parseItalicSegments", () => {
  it("extracts *italic*", () => {
    expect(parseItalicSegments("a *b* c")).toEqual([
      { type: "text", value: "a " },
      { type: "italic", value: "b" },
      { type: "text", value: " c" },
    ]);
  });

  it("preserves literal **", () => {
    expect(parseItalicSegments("a ** b")).toEqual([
      { type: "text", value: "a " },
      { type: "text", value: "**" },
      { type: "text", value: " b" },
    ]);
  });
});

describe("parseInlineMarkdownTree", () => {
  it("combines bold and italic in separate spans", () => {
    expect(parseInlineMarkdownTree("**B** and *I*")).toEqual([
      { type: "bold", children: [{ type: "text", value: "B" }] },
      { type: "text", value: " and " },
      { type: "italic", value: "I" },
    ]);
  });

  it("parses italic inside bold", () => {
    expect(parseInlineMarkdownTree("**bold *inner* end**")).toEqual([
      {
        type: "bold",
        children: [
          { type: "text", value: "bold " },
          { type: "italic", value: "inner" },
          { type: "text", value: " end" },
        ],
      },
    ]);
  });
});
