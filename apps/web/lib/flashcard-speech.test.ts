import { describe, expect, it } from "vitest";
import { pickVoiceForText } from "./flashcard-speech";

function v(name: string, lang: string): SpeechSynthesisVoice {
  return { name, lang, default: false, localService: false, voiceURI: name } as SpeechSynthesisVoice;
}

describe("pickVoiceForText (English)", () => {
  it("default mode prefers the first en-* voice in order (engine order)", () => {
    const voices = [v("Samantha", "en-US"), v("Google UK English Female", "en-GB")];
    const picked = pickVoiceForText("The doctrine applies here.", voices, "default");
    expect(picked).not.toBeNull();
    expect(picked?.lang).toMatch(/^en-us/i);
  });

  it("british mode prefers en-GB over en-US when both exist", () => {
    const voices = [v("Samantha", "en-US"), v("Google UK English Female", "en-GB")];
    const picked = pickVoiceForText("The doctrine applies here.", voices, "british");
    expect(picked).not.toBeNull();
    expect(picked?.lang).toMatch(/^en-gb/i);
  });

  it("prefers UK-named Google voice by name when en-GB lang not listed first", () => {
    const voices = [
      v("Karen", "en-AU"),
      v("Google UK English Male", "en-GB"),
      v("Samantha", "en-US"),
    ];
    const picked = pickVoiceForText("Hello from London.", voices, "british");
    expect(picked?.name).toMatch(/uk english/i);
    expect(picked?.lang).toMatch(/en-gb/i);
  });

  it("british falls back to any English when no British voice is available", () => {
    const voices = [v("Samantha", "en-US"), v("Diego", "es-ES")];
    const picked = pickVoiceForText("English only here.", voices, "british");
    expect(picked?.lang).toMatch(/en-us/i);
  });

  it("american mode prefers en-US when a UK voice is first in the list", () => {
    const voices = [v("Google UK English Male", "en-GB"), v("Samantha", "en-US")];
    const picked = pickVoiceForText("Hello from New York.", voices, "american");
    expect(picked).not.toBeNull();
    expect(picked?.lang).toMatch(/^en-us/i);
  });
});
