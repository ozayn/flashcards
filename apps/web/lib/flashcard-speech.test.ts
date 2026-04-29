import { describe, expect, it } from "vitest";
import {
  isLikelyFarsiCardText,
  pickVoiceForText,
  plainTextForSpeech,
  buildReadCardAnswerPlainSegments,
  READ_CARD_PAUSE_MS,
  READ_ANSWER_EXAMPLE_PAUSE_MS,
} from "./flashcard-speech";

function v(name: string, lang: string): SpeechSynthesisVoice {
  return { name, lang, default: false, localService: false, voiceURI: name } as SpeechSynthesisVoice;
}

describe("pickVoiceForText (English)", () => {
  it("default mode prefers the first en-* voice in order (engine order)", () => {
    const voices = [v("Samantha", "en-US"), v("Google UK English Female", "en-GB")];
    const picked = pickVoiceForText("The doctrine applies here.", voices, {
      englishTts: "default",
    });
    expect(picked).not.toBeNull();
    expect(picked?.lang).toMatch(/^en-us/i);
  });

  it("british mode prefers en-GB over en-US when both exist", () => {
    const voices = [v("Samantha", "en-US"), v("Google UK English Female", "en-GB")];
    const picked = pickVoiceForText("The doctrine applies here.", voices, {
      englishTts: "british",
    });
    expect(picked).not.toBeNull();
    expect(picked?.lang).toMatch(/^en-gb/i);
  });

  it("prefers UK-named Google voice by name when en-GB lang not listed first", () => {
    const voices = [
      v("Karen", "en-AU"),
      v("Google UK English Male", "en-GB"),
      v("Samantha", "en-US"),
    ];
    const picked = pickVoiceForText("Hello from London.", voices, { englishTts: "british" });
    expect(picked?.name).toMatch(/uk english/i);
    expect(picked?.lang).toMatch(/en-gb/i);
  });

  it("british falls back to any English when no British voice is available", () => {
    const voices = [v("Samantha", "en-US"), v("Diego", "es-ES")];
    const picked = pickVoiceForText("English only here.", voices, { englishTts: "british" });
    expect(picked?.lang).toMatch(/en-us/i);
  });

  it("american mode prefers en-US when a UK voice is first in the list", () => {
    const voices = [v("Google UK English Male", "en-GB"), v("Samantha", "en-US")];
    const picked = pickVoiceForText("Hello from New York.", voices, { englishTts: "american" });
    expect(picked).not.toBeNull();
    expect(picked?.lang).toMatch(/^en-us/i);
  });

  it("female style prefers a female-labelled voice in the top accent tier (British)", () => {
    const voices = [
      v("Google UK English Male", "en-GB"),
      v("Google UK English Female", "en-GB"),
    ];
    const picked = pickVoiceForText("The court held.", voices, {
      englishTts: "british",
      voiceStyle: "female",
    });
    expect(picked?.name.toLowerCase()).toContain("female");
  });

  it("male style prefers a male-labelled voice in the top accent tier (American)", () => {
    const voices = [
      v("Google US English", "en-US"),
      v("Samantha", "en-US"),
      v("Custom Male US", "en-US"),
    ];
    // Samantha is a known US female; third has explicit "Male" in name
    const picked = pickVoiceForText("Holding affirmed.", voices, {
      englishTts: "american",
      voiceStyle: "male",
    });
    expect(picked?.name).toMatch(/male/i);
  });
});

describe("pickVoiceForText (Farsi / RTL script)", () => {
  it("treats گ (gaf) as Farsi and prefers fa-IR / fa over ar", () => {
    const farsi = "\u06AF";
    const voices = [v("Majed", "ar-SA"), v("Dorsa", "fa-IR")];
    const picked = pickVoiceForText(farsi, voices, {});
    expect(picked?.lang.toLowerCase().startsWith("fa")).toBe(true);
  });

  it("matches engine tags with underscores (e.g. fa_IR)", () => {
    const voices = [v("A", "ar-EG"), v("B", "fa_IR")];
    const picked = pickVoiceForText("\u067E", voices, {});
    expect(picked).not.toBeNull();
    expect(picked?.name).toBe("B");
  });

  it("uses Arabic (ar) only if no fa / Persian voice is available", () => {
    const voices = [v("Khalid", "ar-SA")];
    const picked = pickVoiceForText("\u06A9", voices, {});
    expect(picked).not.toBeNull();
    expect(picked?.lang.toLowerCase().startsWith("ar")).toBe(true);
  });
});

describe("plainTextForSpeech / Unicode arrow", () => {
  it("reads right arrow as 'to' for natural TTS", () => {
    expect(plainTextForSpeech("USD \u2192 toman")).toBe("USD to toman");
    expect(plainTextForSpeech("input \u2192 output")).toBe("input to output");
  });
});

describe("plainTextForSpeech / block math", () => {
  it("strips block $$...$$ and keeps surrounding prose", () => {
    expect(plainTextForSpeech("A is x. $$\\frac{1}{2}$$ B is y.")).toBe("A is x. B is y.");
  });
  it("strips multiline block math", () => {
    expect(plainTextForSpeech("Def.\n\n$$\nE = mc^2\n$$")).toBe("Def.");
  });
  it("returns empty when the card is only block math", () => {
    expect(plainTextForSpeech("$$x+1$$")).toBe("");
  });
});

describe("buildReadCardAnswerPlainSegments (Example + math)", () => {
  it("splits on Example: into two parts for separate pauses in read path", () => {
    const parts = buildReadCardAnswerPlainSegments("Main idea.\n\nExample:\nA short case.");
    expect(parts).toEqual(["Main idea.", "A short case."]);
  });
  it("removes block math before splitting; keeps spoken parts", () => {
    const parts = buildReadCardAnswerPlainSegments("Sum is 2. $$x$$ More.\n\nExample:\nPi.");
    expect(parts).toEqual(["Sum is 2. More.", "Pi."]);
  });
  it("example-only body after line-leading Example", () => {
    const parts = buildReadCardAnswerPlainSegments("Short def.\n\nExample:\nOnly this.");
    expect(parts[0]).toBe("Short def.");
    expect(parts[1]).toBe("Only this.");
  });
});

describe("TTS pauses: example < question→answer", () => {
  it("READ_ANSWER_EXAMPLE_PAUSE_MS is below READ_CARD_PAUSE_MS", () => {
    expect(READ_ANSWER_EXAMPLE_PAUSE_MS).toBeLessThan(READ_CARD_PAUSE_MS);
  });
});

describe("isLikelyFarsiCardText", () => {
  it("is true for Persian gaf and peh", () => {
    expect(isLikelyFarsiCardText("x\u06A9")).toBe(true);
    expect(isLikelyFarsiCardText("x\u067E")).toBe(true);
  });
  it("is false for unmarked Arabic that omits those letters (ambiguous)", () => {
    expect(isLikelyFarsiCardText("\u0645\u0631\u062D\u0628\u0627")).toBe(false);
  });
});
