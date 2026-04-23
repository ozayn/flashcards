/**
 * Speaking-voice picker: ordering (Recommended vs other) and preview line per voice.
 * Browser `SpeechSynthesisVoice` is a DOM type in client code only; tests pass minimal shape.
 */
export type VoicePickerBucket = "farsi" | "en-gb" | "en-us" | "en-au" | "other";

const RECOMMENDED_ORDER: VoicePickerBucket[] = ["farsi", "en-gb", "en-us", "en-au"];

export function voicePickerBucket(v: Pick<SpeechSynthesisVoice, "name" | "lang">): VoicePickerBucket {
  const n = (v.name || "").trim();
  const raw = (v.lang || "").trim().toLowerCase();
  if (raw.startsWith("fa") || /farsi|persian|dari|پارسی|دری/i.test(n)) {
    return "farsi";
  }
  if (raw === "en_gb" || raw.startsWith("en-gb") || raw.startsWith("en_gb-")) {
    return "en-gb";
  }
  if (raw === "en_au" || raw.startsWith("en-au") || raw.startsWith("en_au-")) {
    return "en-au";
  }
  if (raw === "en" || raw === "en_us" || raw.startsWith("en-us") || raw.startsWith("en-us-") || raw.startsWith("en_us-")) {
    return "en-us";
  }
  if (raw.startsWith("en")) {
    return "other";
  }
  return "other";
}

function byName(a: Pick<SpeechSynthesisVoice, "name">, b: Pick<SpeechSynthesisVoice, "name">) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function partitionPickerVoices(
  voices: ReadonlyArray<SpeechSynthesisVoice>
): { recommended: SpeechSynthesisVoice[]; other: SpeechSynthesisVoice[] } {
  const buckets: Record<VoicePickerBucket, SpeechSynthesisVoice[]> = {
    farsi: [],
    "en-gb": [],
    "en-us": [],
    "en-au": [],
    other: [],
  };
  for (const v of voices) {
    buckets[voicePickerBucket(v)].push(v);
  }
  for (const k of RECOMMENDED_ORDER) {
    buckets[k]!.sort(byName);
  }
  buckets.other.sort(byName);
  const recommended: SpeechSynthesisVoice[] = [];
  for (const k of RECOMMENDED_ORDER) {
    recommended.push(...(buckets[k] ?? []));
  }
  return { recommended, other: buckets.other };
}

/** One line for speech preview; English/Persian tuned for this app. */
export function shortPreviewTextForVoice(v: Pick<SpeechSynthesisVoice, "name" | "lang">): string {
  const l = (v.lang || "").trim().toLowerCase();
  const n = (v.name || "").trim();
  if (l.startsWith("fa") || /farsi|persian|dari|پارسی|دری/i.test(n)) {
    return "این نمونهٔ کوتاهی از صدای انتخابی است.";
  }
  if (l === "en_gb" || l.startsWith("en-gb") || l.startsWith("en_gb-")) {
    return "This is a short sample, in British English.";
  }
  if (l === "en_au" || l.startsWith("en-au") || l.startsWith("en_au-")) {
    return "This is a short sample, in Australian English.";
  }
  if (l === "en" || l === "en_us" || l.startsWith("en-us") || l.startsWith("en-us-") || l.startsWith("en_us-")) {
    return "This is a short sample, in American English.";
  }
  if (l.startsWith("en")) {
    return "This is a short sample in this English voice.";
  }
  return "This is a short voice sample.";
}

export function labelForPickerVoice(v: Pick<SpeechSynthesisVoice, "name" | "lang">): string {
  return v.lang && v.lang.trim() ? `${v.name} (${v.lang})` : v.name;
}
