import { describe, expect, it } from "vitest";
import { plainTextForSpeech } from "./flashcard-speech";
import {
  pythonSourceToSpeakableText,
  replaceInlinePythonBackticksForSpeech,
  replacePythonFencedBlocksForSpeech,
} from "./python-speakable-for-tts";

describe("pythonSourceToSpeakableText", () => {
  it("turns snake_case into spaced words", () => {
    expect(pythonSourceToSpeakableText("train_test_split")).toBe("train test split");
  });

  it("speaks floats like zero point two", () => {
    expect(pythonSourceToSpeakableText("test_size=0.2")).toContain("zero point two");
    expect(pythonSourceToSpeakableText("test_size=0.2")).toContain("equals");
  });

  it("speaks comparison and equality operators", () => {
    expect(pythonSourceToSpeakableText("a == b")).toContain("is equal to");
    expect(pythonSourceToSpeakableText("a = b")).toContain("equals");
    expect(pythonSourceToSpeakableText("a != b")).toContain("not equal to");
  });

  it("uses dot between attribute access", () => {
    expect(pythonSourceToSpeakableText("sklearn.model_selection")).toContain("dot");
  });
});

describe("replacePythonFencedBlocksForSpeech", () => {
  it("replaces ```python blocks only", () => {
    const md = "```python\na == 1\n```";
    expect(replacePythonFencedBlocksForSpeech(md).toLowerCase()).toContain("is equal to");
  });

  it("does not touch ```js blocks (v1 scope)", () => {
    const md = "```js\nconst x = 1\n```";
    expect(replacePythonFencedBlocksForSpeech(md)).toBe(md);
  });
});

describe("replaceInlinePythonBackticksForSpeech", () => {
  it("expands inline snippets that look like code", () => {
    const md = "Use `train_test_split` here.";
    expect(replaceInlinePythonBackticksForSpeech(md).toLowerCase()).toContain("train test split");
  });

  it("leaves short prose in backticks unchanged", () => {
    const md = "Remember `fine` tuning.";
    expect(replaceInlinePythonBackticksForSpeech(md)).toBe(md);
  });
});

describe("plainTextForSpeech + Python fences (integration)", () => {
  it("feeds fenced python through speakable path then strips markdown", () => {
    const md = "Setup.\n\n```python\ny == 0.2\n```\nDone.";
    const out = plainTextForSpeech(md);
    expect(out.toLowerCase()).toContain("is equal to");
    expect(out.toLowerCase()).toContain("zero point two");
    expect(out).toContain("Setup.");
    expect(out).toContain("Done.");
  });
});
