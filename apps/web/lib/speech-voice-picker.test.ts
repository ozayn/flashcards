import { describe, expect, it } from "vitest";
import {
  partitionPickerVoices,
  shortPreviewTextForVoice,
  voicePickerBucket,
} from "./speech-voice-picker";

function v(name: string, lang: string) {
  return { name, lang, voiceURI: `uri:${name}:${lang}` } as SpeechSynthesisVoice;
}

describe("voicePickerBucket", () => {
  it("classifies English regional variants (BCP-47)", () => {
    expect(voicePickerBucket(v("A", "en-GB"))).toBe("en-gb");
    expect(voicePickerBucket(v("B", "en-GB-foo"))).toBe("en-gb");
    expect(voicePickerBucket(v("C", "en"))).toBe("en-us");
    expect(voicePickerBucket(v("D", "en-US"))).toBe("en-us");
    expect(voicePickerBucket(v("E", "en-AU"))).toBe("en-au");
  });

  it("puts en-IN and en-IE in en-other", () => {
    expect(voicePickerBucket(v("A", "en-IN"))).toBe("en-other");
    expect(voicePickerBucket(v("B", "en-IE"))).toBe("en-other");
  });

  it("returns en-other for non-English lang tags (picker only applies this after English filter)", () => {
    expect(voicePickerBucket(v("Test", "fa-IR"))).toBe("en-other");
    expect(voicePickerBucket(v("Dari", "fa-AF"))).toBe("en-other");
  });
});

describe("partitionPickerVoices", () => {
  it("lists only study-eligible English voices and omits novelty / non-English", () => {
    const voices = [
      v("z-OtherLang", "de-DE"),
      v("Grandma", "en-GB"),
      v("Flo", "en-GB"),
      v("A-US", "en-US"),
      v("Daniel", "en-GB"),
      v("Grandpa", "en-GB"),
      v("Rocko", "en-GB"),
      v("C-AU", "en-AU"),
      v("Shelley", "en-GB"),
      v("Eddy", "en-GB"),
      v("Sandy", "en-GB"),
      v("Reed", "en-GB"),
      v("Fa", "fa-IR"),
    ] as SpeechSynthesisVoice[];
    const { recommended, other, sections } = partitionPickerVoices(voices);
    expect(other).toEqual([]);
    expect(recommended.map((x) => x.name)).toEqual(["Flo", "Shelley", "Sandy", "Daniel", "Reed", "A-US", "C-AU"]);
    expect(sections.map((s) => s.title)).toEqual(["Recommended", "British English", "American English", "Australian English"]);
    expect(sections[0].voices.map((x) => x.name)).toEqual(["Flo", "Shelley", "Sandy"]);
    expect(sections[1].voices.map((x) => x.name)).toEqual(["Daniel", "Reed"]);
  });
});

describe("shortPreviewTextForVoice", () => {
  it("uses expected lines for en-GB, en-US, en-AU, fa, and default", () => {
    expect(shortPreviewTextForVoice(v("X", "fa-IR"))).toContain("نمونه");
    expect(shortPreviewTextForVoice(v("X", "en-GB"))).toMatch(/British/i);
    expect(shortPreviewTextForVoice(v("X", "en-AU"))).toMatch(/Australian/i);
    expect(shortPreviewTextForVoice(v("X", "en-US"))).toMatch(/American/);
    expect(shortPreviewTextForVoice(v("X", "de-DE"))).toBe("This is a short voice sample.");
  });
});
