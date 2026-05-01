/**
 * English-only speaking-voice picker with regional sections and macOS-style UK ordering.
 */
import { isStudyPickerEligibleSpeechVoice } from "./flashcard-speech";

export type VoicePickerBucket = "en-gb" | "en-us" | "en-au" | "en-other";

function normalizeLang(lang: string | undefined): string {
  return (lang || "").trim().toLowerCase().replace(/_/g, "-");
}

/** Regional bucket for English voices only (`en`, `en-*`). */
export function voicePickerBucket(v: Pick<SpeechSynthesisVoice, "name" | "lang">): VoicePickerBucket {
  const raw = normalizeLang(v.lang);
  if (raw === "en-gb" || raw.startsWith("en-gb-")) return "en-gb";
  if (raw === "en-au" || raw.startsWith("en-au-")) return "en-au";
  if (raw === "en" || raw === "en-us" || raw.startsWith("en-us-")) return "en-us";
  if (raw.startsWith("en-")) return "en-other";
  return "en-other";
}

function byName(a: Pick<SpeechSynthesisVoice, "name">, b: Pick<SpeechSynthesisVoice, "name">) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/**
 * macOS Chrome-style UK “natural” voices to surface first (word-boundary match on display name).
 */
function isBritishNaturalRecommendedName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return /\bflo\b/.test(n) || /\bshelley\b/.test(n) || /\bsandy\b/.test(n);
}

/** Lower tier = earlier in the British English list (novelty voices are filtered before sort). */
function britishVoiceSortRank(name: string): { tier: number; sub: number } {
  const n = name.trim().toLowerCase();
  if (/\bflo\b/.test(n)) return { tier: 0, sub: 0 };
  if (/\bshelley\b/.test(n)) return { tier: 0, sub: 1 };
  if (/\bsandy\b/.test(n)) return { tier: 0, sub: 2 };
  return { tier: 2, sub: 0 };
}

function compareBritishVoices(a: SpeechSynthesisVoice, b: SpeechSynthesisVoice): number {
  const ra = britishVoiceSortRank(a.name);
  const rb = britishVoiceSortRank(b.name);
  if (ra.tier !== rb.tier) return ra.tier - rb.tier;
  if (ra.sub !== rb.sub) return ra.sub - rb.sub;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export type PickerVoiceSection = { title: string | null; voices: SpeechSynthesisVoice[] };

export function partitionEnglishPickerSections(voices: ReadonlyArray<SpeechSynthesisVoice>): {
  sections: PickerVoiceSection[];
  other: SpeechSynthesisVoice[];
  recommendedFlat: SpeechSynthesisVoice[];
} {
  const en = voices.filter(isStudyPickerEligibleSpeechVoice);
  const buckets: Record<VoicePickerBucket, SpeechSynthesisVoice[]> = {
    "en-gb": [],
    "en-us": [],
    "en-au": [],
    "en-other": [],
  };
  for (const v of en) {
    buckets[voicePickerBucket(v)].push(v);
  }

  const gb = [...buckets["en-gb"]].sort(compareBritishVoices);
  const britishRecommended = gb.filter((v) => isBritishNaturalRecommendedName(v.name));
  const britishRest = gb.filter((v) => !isBritishNaturalRecommendedName(v.name));

  buckets["en-us"].sort(byName);
  buckets["en-au"].sort(byName);
  buckets["en-other"].sort(byName);

  const sections: PickerVoiceSection[] = [];
  if (britishRecommended.length > 0) {
    sections.push({ title: "Recommended", voices: britishRecommended });
  }
  if (britishRest.length > 0) {
    sections.push({ title: "British English", voices: britishRest });
  }
  if (buckets["en-us"].length > 0) {
    sections.push({ title: "American English", voices: buckets["en-us"] });
  }
  if (buckets["en-au"].length > 0) {
    sections.push({ title: "Australian English", voices: buckets["en-au"] });
  }
  if (buckets["en-other"].length > 0) {
    sections.push({ title: "Other English voices", voices: buckets["en-other"] });
  }

  const recommendedFlat = sections.flatMap((s) => s.voices);
  return { sections, other: [], recommendedFlat };
}

/**
 * English-only partition; `recommended` is the flat list for compatibility, `sections` for UI headings.
 */
export function partitionPickerVoices(voices: ReadonlyArray<SpeechSynthesisVoice>): {
  recommended: SpeechSynthesisVoice[];
  other: SpeechSynthesisVoice[];
  sections: PickerVoiceSection[];
} {
  const { sections, other, recommendedFlat } = partitionEnglishPickerSections(voices);
  return { recommended: recommendedFlat, other, sections };
}

/** One line for speech preview; tuned for English regional voices. */
export function shortPreviewTextForVoice(v: Pick<SpeechSynthesisVoice, "name" | "lang">): string {
  const l = normalizeLang(v.lang);
  const n = (v.name || "").trim();
  if (l.startsWith("fa") || /farsi|persian|dari|پارسی|دری/i.test(n)) {
    return "این نمونهٔ کوتاهی از صدای انتخابی است.";
  }
  if (l === "en-gb" || l.startsWith("en-gb-")) {
    return "This is a short sample, in British English.";
  }
  if (l === "en-au" || l.startsWith("en-au-")) {
    return "This is a short sample, in Australian English.";
  }
  if (l === "en" || l === "en-us" || l.startsWith("en-us-")) {
    return "This is a short sample, in American English.";
  }
  if (l.startsWith("en-")) {
    return "This is a short sample in this English voice.";
  }
  return "This is a short voice sample.";
}

export function labelForPickerVoice(v: Pick<SpeechSynthesisVoice, "name" | "lang">): string {
  return v.lang && v.lang.trim() ? `${v.name} (${v.lang})` : v.name;
}
