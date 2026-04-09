import { describe, expect, it } from "vitest";
import { inferTextDirection } from "./infer-text-direction";

describe("inferTextDirection", () => {
  it("returns rtl when Hebrew precedes Latin", () => {
    expect(inferTextDirection("שלום means hello")).toBe("rtl");
  });

  it("returns ltr for English-only", () => {
    expect(inferTextDirection("What is photosynthesis?")).toBe("ltr");
  });

  it("returns ltr for empty input", () => {
    expect(inferTextDirection("", null, undefined)).toBe("ltr");
  });
});
