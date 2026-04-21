import { describe, expect, it } from "vitest";
import { resolveFencePrismLanguage } from "./fenced-code-prism-lang";

describe("resolveFencePrismLanguage", () => {
  it("returns null for missing or blank", () => {
    expect(resolveFencePrismLanguage(undefined)).toBeNull();
    expect(resolveFencePrismLanguage("")).toBeNull();
    expect(resolveFencePrismLanguage("   ")).toBeNull();
  });

  it("maps common tags", () => {
    expect(resolveFencePrismLanguage("python")).toBe("python");
    expect(resolveFencePrismLanguage("py")).toBe("python");
    expect(resolveFencePrismLanguage("SQL")).toBe("sql");
    expect(resolveFencePrismLanguage("javascript")).toBe("javascript");
    expect(resolveFencePrismLanguage("js")).toBe("javascript");
    expect(resolveFencePrismLanguage("bash")).toBe("bash");
    expect(resolveFencePrismLanguage("sh")).toBe("bash");
  });

  it("returns null for unsupported languages", () => {
    expect(resolveFencePrismLanguage("rust")).toBeNull();
    expect(resolveFencePrismLanguage("typescript")).toBeNull();
  });
});
