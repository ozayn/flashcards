import { describe, expect, it } from "vitest";
import { splitFencedCodeBlocks } from "./fenced-code";

describe("splitFencedCodeBlocks", () => {
  it("returns a single text segment when no fences", () => {
    expect(splitFencedCodeBlocks("hello")).toEqual([{ kind: "text", value: "hello" }]);
  });

  it("extracts fenced body and optional language", () => {
    const src = "intro\n```python\nx = 1\n```\noutro";
    expect(splitFencedCodeBlocks(src)).toEqual([
      { kind: "text", value: "intro\n" },
      { kind: "fenced", body: "x = 1", info: "python" },
      { kind: "text", value: "outro" },
    ]);
  });

  it("normalizes CRLF", () => {
    const src = "```\r\nline\r\n```";
    expect(splitFencedCodeBlocks(src)).toEqual([
      { kind: "fenced", body: "line", info: undefined },
    ]);
  });

  it("treats unclosed fence as plain text (remainder after opening line is its own segment)", () => {
    const src = "a ```python\nno close";
    expect(splitFencedCodeBlocks(src)).toEqual([
      { kind: "text", value: "a " },
      { kind: "text", value: "```python\nno close" },
    ]);
  });

  it("treats opening fence without newline on same line as plain text chunks", () => {
    const src = "x ```inline``` y";
    expect(splitFencedCodeBlocks(src)).toEqual([
      { kind: "text", value: "x " },
      { kind: "text", value: "```inline``` y" },
    ]);
  });

  it("matches closing fence line that is only ``` (trailing spaces on that line are not part of fence)", () => {
    const src = "```\na\n```  \n";
    expect(splitFencedCodeBlocks(src)).toEqual([{ kind: "fenced", body: "a", info: undefined }]);
  });
});
