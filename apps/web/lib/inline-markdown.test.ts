import { describe, expect, it } from "vitest";
import {
  parseBoldSegments,
  parseInlineMarkdownTree,
  parseInlineMarkdownTreeWithCode,
  parseItalicSegments,
  splitInlineCode,
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

describe("splitInlineCode", () => {
  it("extracts inline code", () => {
    expect(splitInlineCode("Use `fit()` here")).toEqual([
      { type: "text", value: "Use " },
      { type: "inlineCode", value: "fit()" },
      { type: "text", value: " here" },
    ]);
  });

  it("consumes ``` as literal text chunks (fenced blocks are split earlier in FormattedText)", () => {
    expect(splitInlineCode("a ```b``` c")).toEqual([
      { type: "text", value: "a ```" },
      { type: "text", value: "b```" },
      { type: "text", value: " c" },
    ]);
  });

  it("does not treat newlines inside backticks as inline code", () => {
    expect(splitInlineCode("`a\nb`")).toEqual([{ type: "text", value: "`a\nb`" }]);
  });
});

describe("parseInlineMarkdownTreeWithCode", () => {
  it("parses code inside bold; code runs before italic pairing on the rest", () => {
    expect(parseInlineMarkdownTreeWithCode("**`x`** and *`y`*")).toEqual([
      {
        type: "bold",
        children: [{ type: "code", value: "x" }],
      },
      { type: "text", value: " and " },
      { type: "text", value: "*" },
      { type: "code", value: "y" },
      { type: "text", value: "*" },
    ]);
  });

  it("parses code outside bold", () => {
    expect(parseInlineMarkdownTreeWithCode("call `train_test_split()`")).toEqual([
      { type: "text", value: "call " },
      { type: "code", value: "train_test_split()" },
    ]);
  });
});
