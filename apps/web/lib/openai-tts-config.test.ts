import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENAI_TTS_VOICE,
  normalizeOpenAiTtsSpeed,
  normalizeOpenAiTtsVoice,
  normalizeReadAloudProvider,
} from "./openai-tts-config";
import { languageHintForOpenAiTts, plainTextForSpeech } from "./flashcard-speech";

describe("openai-tts-config", () => {
  it("defaults provider to browser", () => {
    expect(normalizeReadAloudProvider(undefined)).toBe("browser");
    expect(normalizeReadAloudProvider("openai")).toBe("openai");
    expect(normalizeReadAloudProvider("nope")).toBe("browser");
  });

  it("defaults OpenAI voice to fable and rejects unknown ids", () => {
    expect(normalizeOpenAiTtsVoice(undefined)).toBe(DEFAULT_OPENAI_TTS_VOICE);
    expect(normalizeOpenAiTtsVoice("marin")).toBe("marin");
    expect(normalizeOpenAiTtsVoice("not-a-voice")).toBe(DEFAULT_OPENAI_TTS_VOICE);
  });

  it("clamps OpenAI speed to 0.25–4", () => {
    expect(normalizeOpenAiTtsSpeed(undefined)).toBe(1.0);
    expect(normalizeOpenAiTtsSpeed(0.1)).toBe(0.25);
    expect(normalizeOpenAiTtsSpeed(9)).toBe(4.0);
    expect(normalizeOpenAiTtsSpeed(1.2)).toBe(1.2);
  });
});

describe("languageHintForOpenAiTts", () => {
  it("marks clear Farsi text as fa (not ar)", () => {
    expect(languageHintForOpenAiTts("می‌روم به خانه")).toBe("fa");
  });

  it("marks English as en", () => {
    expect(languageHintForOpenAiTts("What is photosynthesis?")).toBe("en");
  });
});

describe("plainTextForSpeech still strips display math for OpenAI path", () => {
  it("removes $$ blocks", () => {
    const out = plainTextForSpeech("Area is $$E=mc^2$$ square");
    expect(out).not.toContain("E=mc");
    expect(out.toLowerCase()).toContain("area");
  });
});
