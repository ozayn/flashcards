import { describe, expect, it } from "vitest";
import {
  getSpeechVoiceKey,
  isLikelyFarsiCardText,
  isNoveltyOrCharacterSpeechVoice,
  isStudyPickerEligibleSpeechVoice,
  pickVoiceForText,
  plainTextForSpeech,
  resolveFlashcardVoice,
  buildReadCardAnswerPlainSegments,
  READ_CARD_PAUSE_MS,
  READ_ANSWER_EXAMPLE_PAUSE_MS,
} from "./flashcard-speech";

function v(name: string, lang: string): SpeechSynthesisVoice {
  return { name, lang, default: false, localService: false, voiceURI: name } as SpeechSynthesisVoice;
}

describe("study picker voice eligibility", () => {
  it("flags novelty names and keeps normal English", () => {
    expect(isNoveltyOrCharacterSpeechVoice(v("Grandma (English (United Kingdom))", "en-GB"))).toBe(true);
    expect(isNoveltyOrCharacterSpeechVoice(v("Grandpa", "en-GB"))).toBe(true);
    expect(isNoveltyOrCharacterSpeechVoice(v("Eddy (English (United Kingdom))", "en-GB"))).toBe(true);
    expect(isNoveltyOrCharacterSpeechVoice(v("Rocko", "en-GB"))).toBe(true);
    expect(isNoveltyOrCharacterSpeechVoice(v("Daniel", "en-GB"))).toBe(false);
    expect(isNoveltyOrCharacterSpeechVoice(v("Samantha", "en-US"))).toBe(false);
  });

  it("isStudyPickerEligibleSpeechVoice requires English and not novelty", () => {
    expect(isStudyPickerEligibleSpeechVoice(v("Daniel", "en-GB"))).toBe(true);
    expect(isStudyPickerEligibleSpeechVoice(v("Grandma", "en-GB"))).toBe(false);
    expect(isStudyPickerEligibleSpeechVoice(v("Marie", "fr-FR"))).toBe(false);
  });

  it("resolveFlashcardVoice ignores saved key when it matches a novelty voice", () => {
    const grandma = v("Grandma", "en-GB");
    const daniel = v("Daniel", "en-GB");
    const r = resolveFlashcardVoice("Hello there.", [grandma, daniel], {
      speechVoiceKey: getSpeechVoiceKey(grandma),
      englishTts: "british",
      voiceStyle: "default",
    });
    expect(r.resolution).toBe("user_picker_unavailable");
    expect(r.voice?.name).toBe("Daniel");
  });
});

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

  it("returns null for clearly-Farsi text when only Arabic voices exist (caller uses fa-IR lang)", () => {
    const voices = [v("Khalid", "ar-SA")];
    /** "می‌رود" — has Persian-specific letter چ... actually گ + ZWNJ; either is a Farsi signal. */
    const picked = pickVoiceForText("\u06A9", voices, {});
    expect(picked).toBeNull();
  });

  it("falls back to Arabic for ambiguous RTL (no Persian-specific letters / digits / ZWNJ)", () => {
    const voices = [v("Khalid", "ar-SA")];
    /** "مرحبا" — Arabic-only letters, no Persian signal. */
    const picked = pickVoiceForText("\u0645\u0631\u062D\u0628\u0627", voices, {});
    expect(picked?.lang.toLowerCase().startsWith("ar")).toBe(true);
  });

  it("prefers Persian voice when text uses Persian digits even without Persian-specific letters", () => {
    const voices = [v("Khalid", "ar-SA"), v("Dorsa", "fa-IR")];
    /** "۱۲۳" — Persian digits only. */
    const picked = pickVoiceForText("\u06F1\u06F2\u06F3", voices, {});
    expect(picked?.lang.toLowerCase().startsWith("fa")).toBe(true);
  });

  it("prefers Persian voice when text uses ZWNJ in RTL script", () => {
    const voices = [v("Khalid", "ar-SA"), v("Dorsa", "fa-IR")];
    /** "می‌رود" using ی (shared) + ZWNJ + ر و د (shared). */
    const picked = pickVoiceForText("\u0645\u06CC\u200C\u0631\u0648\u062F", voices, {});
    expect(picked?.lang.toLowerCase().startsWith("fa")).toBe(true);
  });
});

describe("plainTextForSpeech / Unicode arrow", () => {
  it("reads right arrow as 'to' for natural TTS", () => {
    expect(plainTextForSpeech("USD \u2192 toman")).toBe("USD to toman");
    expect(plainTextForSpeech("input \u2192 output")).toBe("input to output");
  });
});

describe("plainTextForSpeech / Persian pronunciation cleanup", () => {
  it("strips tatweel / kashida (U+0640) used purely for decoration", () => {
    /** "ســـلام" → "سلام": the engine should pronounce salām, not stretched runs. */
    expect(plainTextForSpeech("\u0633\u0640\u0640\u0640\u0644\u0627\u0645")).toBe("\u0633\u0644\u0627\u0645");
  });
  it("strips invisible bidi format controls (LRM/RLM/ALM/isolates)", () => {
    /** RLM (U+200F) and LRM (U+200E) between Persian letters: should vanish, keep letters intact. */
    const input = "\u200Fسلام\u200E، خوش آمدید";
    expect(plainTextForSpeech(input)).toBe("سلام، خوش آمدید");
  });
  it("collapses runs of ZWNJ but keeps a single ZWNJ for morphology", () => {
    /** می‌‌‌رود (3× ZWNJ) → می‌رود (1× ZWNJ). */
    const input = "\u0645\u06CC\u200C\u200C\u200C\u0631\u0648\u062F";
    const out = plainTextForSpeech(input);
    expect(out).toBe("\u0645\u06CC\u200C\u0631\u0648\u062F");
  });
  it("preserves Persian punctuation that carries prosody (، ؛ ؟)", () => {
    /** Comma, semicolon, question mark are kept so the engine pauses correctly. */
    expect(plainTextForSpeech("سلام، حال شما چطور است؟")).toBe("سلام، حال شما چطور است؟");
  });
});

describe("plainTextForSpeech / underscores for TTS", () => {
  it("replaces underscore-separated tokens with spaces (avoids TTS reading _ as underscore)", () => {
    expect(plainTextForSpeech("Use train_test_split here.")).toBe("Use train test split here.");
    expect(plainTextForSpeech("Status: not_started")).toBe("Status: not started");
    expect(plainTextForSpeech("cross_val_score")).toBe("cross val score");
  });

  it("collapses runs of underscores to a single space gap", () => {
    expect(plainTextForSpeech("a__b")).toBe("a b");
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
  it("is true for Persian digits (۰–۹)", () => {
    expect(isLikelyFarsiCardText("\u06F1\u06F2\u06F3")).toBe(true);
    expect(isLikelyFarsiCardText("\u06F0")).toBe(true);
  });
  it("is true for ZWNJ embedded in RTL Arabic-script text (Persian morphology)", () => {
    /** "می‌رود": ZWNJ between می and رود is a strong Persian signal. */
    expect(isLikelyFarsiCardText("\u0645\u06CC\u200C\u0631\u0648\u062F")).toBe(true);
  });
  it("is false for unmarked Arabic that omits those letters / digits / ZWNJ (ambiguous)", () => {
    expect(isLikelyFarsiCardText("\u0645\u0631\u062D\u0628\u0627")).toBe(false);
  });
  it("ignores ZWNJ when no RTL script is present (Latin text with stray U+200C is not Farsi)", () => {
    expect(isLikelyFarsiCardText("foo\u200Cbar")).toBe(false);
  });
});
