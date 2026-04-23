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
  it("classifies farsi and Persian names", () => {
    expect(voicePickerBucket(v("Test", "fa-IR"))).toBe("farsi");
    expect(voicePickerBucket(v("Dari", "fa-AF"))).toBe("farsi");
    expect(voicePickerBucket(v("Persian Voice", "en-US"))).toBe("farsi");
  });

  it("classifies English regional variants for recommended groups", () => {
    expect(voicePickerBucket(v("A", "en-GB"))).toBe("en-gb");
    expect(voicePickerBucket(v("B", "en-GB-foo"))).toBe("en-gb");
    expect(voicePickerBucket(v("C", "en"))).toBe("en-us");
    expect(voicePickerBucket(v("D", "en-US"))).toBe("en-us");
    expect(voicePickerBucket(v("E", "en-AU"))).toBe("en-au");
  });

  it("puts other English (e.g. en-IN) in other", () => {
    expect(voicePickerBucket(v("A", "en-IN"))).toBe("other");
    expect(voicePickerBucket(v("B", "en-IE"))).toBe("other");
  });
});

describe("partitionPickerVoices", () => {
  it("orders farsi, then en-gb, en-us, en-au, and puts remaining in other", () => {
    const voices = [
      v("z-OtherLang", "de-DE"),
      v("A-US", "en-US"),
      v("C-AU", "en-AU"),
      v("B-GB", "en-GB"),
      v("Fa", "fa-IR"),
    ] as SpeechSynthesisVoice[];
    const { recommended, other } = partitionPickerVoices(voices);
    expect(recommended.map((x) => x.name)).toEqual(["Fa", "B-GB", "A-US", "C-AU"]);
    expect(other.map((x) => x.name)).toEqual(["z-OtherLang"]);
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
