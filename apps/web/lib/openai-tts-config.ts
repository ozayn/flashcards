/**
 * Curated OpenAI TTS voices for MemoNext (v1).
 * Keep in sync with apps/api/app/core/openai_tts_config.py OPENAI_TTS_VOICES.
 */

export const OPENAI_TTS_VOICES = [
  { id: "fable", label: "Fable" },
  { id: "shimmer", label: "Shimmer" },
  { id: "marin", label: "Marin" },
  { id: "coral", label: "Coral" },
  { id: "nova", label: "Nova" },
  { id: "alloy", label: "Alloy" },
  { id: "echo", label: "Echo" },
  { id: "sage", label: "Sage" },
] as const;

export type OpenAiTtsVoiceId = (typeof OPENAI_TTS_VOICES)[number]["id"];

export const DEFAULT_OPENAI_TTS_VOICE: OpenAiTtsVoiceId = "fable";

export type ReadAloudProvider = "browser" | "openai";

/** Curated OpenAI playback speeds for the Profile UI. */
export const OPENAI_TTS_SPEED_OPTIONS = [
  { value: 0.85, label: "Slow" },
  { value: 1.0, label: "Normal" },
  { value: 1.2, label: "Fast" },
] as const;

export function normalizeReadAloudProvider(
  raw: string | null | undefined,
): ReadAloudProvider {
  return raw === "openai" ? "openai" : "browser";
}

export function normalizeOpenAiTtsVoice(
  raw: string | null | undefined,
): OpenAiTtsVoiceId {
  const v = (raw || "").trim().toLowerCase();
  if (OPENAI_TTS_VOICES.some((x) => x.id === v)) {
    return v as OpenAiTtsVoiceId;
  }
  return DEFAULT_OPENAI_TTS_VOICE;
}

/** Clamp to OpenAI's 0.25–4.0 range; default 1. */
export function normalizeOpenAiTtsSpeed(raw: number | null | undefined): number {
  if (raw == null || typeof raw !== "number" || Number.isNaN(raw)) return 1.0;
  return Math.max(0.25, Math.min(4.0, Math.round(raw * 100) / 100));
}
