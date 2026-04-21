import { describe, expect, it } from "vitest";
import { splitInlineDollarMath } from "./inline-math-dollars";

describe("splitInlineDollarMath", () => {
  it("extracts a simple inline math span", () => {
    expect(splitInlineDollarMath("event $A$ means")).toEqual([
      { type: "text", value: "event " },
      { type: "math", value: "A" },
      { type: "text", value: " means" },
    ]);
  });

  it("keeps $$ as literal dollars", () => {
    expect(splitInlineDollarMath("a$$b")).toEqual([{ type: "text", value: "a$$b" }]);
  });

  it("leaves lone $ as text when unclosed", () => {
    expect(splitInlineDollarMath("cost $5")).toEqual([{ type: "text", value: "cost $5" }]);
  });

  it("rejects digit-only inner as currency-like", () => {
    expect(splitInlineDollarMath("x$5$y")).toEqual([{ type: "text", value: "x$5$y" }]);
  });

  it("rejects empty inner as literal", () => {
    expect(splitInlineDollarMath("a$ $b")).toEqual([{ type: "text", value: "a$ $b" }]);
  });

  it("does not cross newlines", () => {
    expect(splitInlineDollarMath("a$\nx$")).toEqual([{ type: "text", value: "a$\nx$" }]);
  });

  it("respects backslash-escaped dollars inside math", () => {
    expect(splitInlineDollarMath(String.raw`$\$2$`)).toEqual([{ type: "math", value: String.raw`\$2` }]);
  });
});
