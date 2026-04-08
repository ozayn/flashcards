import { describe, expect, it } from "vitest";
import { splitImportAnswerOnExampleMarker } from "./import-answer-split";

describe("splitImportAnswerOnExampleMarker", () => {
  it("splits line-leading Example: (Q/A continuation style)", () => {
    const raw =
      "The process by which plants convert light to chemical energy.\n\nExample:\nA leaf in sunlight.";
    const { main, example } = splitImportAnswerOnExampleMarker(raw);
    expect(main).toBe(
      "The process by which plants convert light to chemical energy."
    );
    expect(example).toBe("A leaf in sunlight.");
  });

  it("splits same-line ... Example: after a sentence end (common A: one-liner)", () => {
    const raw =
      "The capital of France is Paris. Example: The Louvre is located there.";
    const { main, example } = splitImportAnswerOnExampleMarker(raw);
    expect(main).toBe("The capital of France is Paris.");
    expect(example).toBe("The Louvre is located there.");
  });

  it("does not split mid-sentence See Example:", () => {
    const raw = "See Example: not a heading.";
    const { main, example } = splitImportAnswerOnExampleMarker(raw);
    expect(main).toBe(raw);
    expect(example).toBeNull();
  });
});
