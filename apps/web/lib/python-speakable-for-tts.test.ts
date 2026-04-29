import { describe, expect, it } from "vitest";
import { plainTextForSpeech } from "./flashcard-speech";
import {
  applyPythonPronunciationDictionary,
  pythonSourceToSpeakableText,
  replaceInlinePythonBackticksForSpeech,
  replacePythonFencedBlocksForSpeech,
} from "./python-speakable-for-tts";

describe("applyPythonPronunciationDictionary", () => {
  it("spells import aliases and expands dotted abbreviations", () => {
    expect(applyPythonPronunciationDictionary("import pandas as pd")).toMatch(/P D/);
    expect(applyPythonPronunciationDictionary("pd.read_csv()")).toMatch(/pandas/);
    expect(applyPythonPronunciationDictionary("np.zeros(3)")).toMatch(/numpy/);
  });
});

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

  it("uses dot between attribute access and expands sklearn", () => {
    const out = pythonSourceToSpeakableText("sklearn.model_selection");
    expect(out).toContain("dot");
    expect(out.toLowerCase()).toContain("scikit learn");
  });

  it("speaks sklearn imports and ML helpers naturally", () => {
    const line = "from sklearn.model_selection import train_test_split";
    const out = pythonSourceToSpeakableText(line).toLowerCase();
    expect(out).toContain("scikit learn");
    expect(out).toContain("train test split");
  });

  it("handles df.groupby and predict_proba", () => {
    const g = pythonSourceToSpeakableText("df.groupby('x')").toLowerCase();
    expect(g).toContain("data frame");
    expect(g).toContain("group by");
    const p = pythonSourceToSpeakableText("model.predict_proba(X)").toLowerCase();
    expect(p).toContain("predict probability");
  });

  it("expands len and iloc before loc", () => {
    expect(pythonSourceToSpeakableText("len(x)")).toContain("length");
    expect(pythonSourceToSpeakableText("df.iloc[0]")).toMatch(/eye lock/i);
    expect(pythonSourceToSpeakableText("df.loc[0]")).toMatch(/\block\b/i);
  });

  it("reads **kwargs without star-star noise", () => {
    const out = pythonSourceToSpeakableText("def f(**kwargs): pass").toLowerCase();
    expect(out).toContain("keyword args");
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
