/**
 * Client-side TTS for flashcards via the Web Speech API.
 * New utterances cancel prior playback; `speakOrToggle` stops if the same key is playing.
 */

import { splitImportAnswerOnExampleMarker } from "@/lib/import-answer-split";
import {
  replaceInlinePythonBackticksForSpeech,
  replacePythonFencedBlocksForSpeech,
} from "@/lib/python-speakable-for-tts";

const RTL_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const CJK_RE = /[\u3040-\u30ff\u31f0-\u31ff\u4e00-\u9fff\uac00-\ud7af]/;

/** Letters used in Persian (Farsi) that standard Arabic does not use — strong signal the card is Farsi, not Arabic. */
const PERSIAN_SPECIFIC_RE = /[\u06A9\u06AF\u067E\u0686\u0698\u06A4\u06B5\u06B7]/;

const _DEV =
  typeof process !== "undefined" && process.env && process.env.NODE_ENV === "development";

/** Same gating as `pickVoiceForText` before RTL/Farsi branches: Latin English, not RTL script. */
function isPlainEnglishPreferencePath(plain: string): boolean {
  const t = (plain || "").trim();
  if (CJK_RE.test(t) || /[\u0400-\u04FF]/.test(t) || /[\u0590-\u05FF]/.test(t)) return false;
  if (RTL_SCRIPT_RE.test(t)) return false;
  return /[a-zA-Z]{2,}/.test(t);
}

/** When not binding `utterance.voice`, weak locale hint for accent (default = leave unset). */
function langHintForAutoEnglishWithoutVoice(
  englishTts: "default" | "british" | "american" | undefined
): string | undefined {
  const m = englishTts ?? "default";
  if (m === "british") return "en-GB";
  if (m === "american") return "en-US";
  return undefined;
}

function voiceKey(v: SpeechSynthesisVoice): string {
  return `${v.voiceURI}|${v.name}|${v.lang || ""}`;
}

/** Stable id for a browser voice; store in user settings and match with `getVoices()`. */
export function getSpeechVoiceKey(v: SpeechSynthesisVoice): string {
  return voiceKey(v);
}

function normalizeLang(lang: string | undefined): string {
  return (lang || "").trim().toLowerCase().replace(/_/g, "-");
}

function isArVoiceLanguage(lang: string | undefined): boolean {
  const l = normalizeLang(lang);
  return l === "ar" || l.startsWith("ar-");
}

/** BCP-47: `fa`, `fa-IR`, etc.; `fa_IR` normalizes to `fa-ir`. */
function isFaVoiceLanguage(lang: string | undefined): boolean {
  const l = normalizeLang(lang);
  return l === "fa" || l.startsWith("fa-");
}

function isPersianByVoiceName(name: string): boolean {
  if (/فارس|فارسى|پارس|پارسى|فارسی|پارسی/.test(name)) {
    return true;
  }
  const s = name.toLowerCase();
  if (/\bfarsi\b/.test(s) || s.includes(" farsi") || s.startsWith("farsi ")) return true;
  if (s.includes("persian") && !/persian gulf|gulf persian|english persian|war/.test(s)) return true;
  if (s.includes(" iran") && (s.includes("farsi") || s.includes("persian") || s.includes("voice"))) return true;
  if (s.includes("iranian") && (s.includes("farsi") || s.includes("persian") || s.includes("dari")))
    return true;
  if (/\bdari\b/.test(s) && (s.includes("persian") || s.includes("eastern") || s.includes("afghan"))) return true;
  return false;
}

/**
 * Persian (fa) voice: `fa` / `fa-IR` tags (underscore normalized), or a Persian/Farsi
 * name. Never count `ar-*` as Persian even if the name is misleading.
 */
function isPersianSpeechVoice(v: SpeechSynthesisVoice): boolean {
  if (v.lang && isArVoiceLanguage(v.lang)) return false;
  if (v.lang && isFaVoiceLanguage(v.lang)) return true;
  if (isPersianByVoiceName(v.name)) {
    if (v.lang && isArVoiceLanguage(v.lang)) return false;
    return true;
  }
  return false;
}

/**
 * Ranks `fa-IR` before `fa` before other `fa-*` for the same name tie-breaks. Lower = better.
 */
function persianLangPreferenceRank(lang: string | undefined): number {
  const l = normalizeLang(lang);
  if (l === "fa-ir") return 0;
  if (l === "fa") return 1;
  if (l.startsWith("fa-")) return 2;
  if (!l) return 4;
  if (l.startsWith("en")) return 5;
  return 3;
}

function orderPersianVoicesForFarsi(
  list: ReadonlyArray<SpeechSynthesisVoice>
): SpeechSynthesisVoice[] {
  return [...list].sort((a, b) => {
    const d = persianLangPreferenceRank(a.lang) - persianLangPreferenceRank(b.lang);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

/**
 * Picks a voice for Farsi/RTL: Persian (`fa*`) and Persian-labelled voices first; Arabic
 * only if no suitable Persian voice is available. Applies `voiceStyle` on each tier.
 */
function pickFarsiOrRtlSpeechVoice(
  voices: ReadonlyArray<SpeechSynthesisVoice>,
  voiceStyle: VoiceStylePreference
): SpeechSynthesisVoice | null {
  const persian = orderPersianVoicesForFarsi(voices.filter(isPersianSpeechVoice));
  if (persian.length > 0) {
    return applyVoiceStylePreference(persian, voiceStyle) ?? persian[0] ?? null;
  }
  const arOnly = voices.filter((v) => v.lang && isArVoiceLanguage(v.lang));
  if (arOnly.length > 0) {
    return applyVoiceStylePreference(arOnly, voiceStyle) ?? arOnly[0] ?? null;
  }
  return null;
}

/**
 * true when the card text is likely Farsi (contains Persian-only letters in the shared Arabic script).
 */
export function isLikelyFarsiCardText(text: string): boolean {
  return PERSIAN_SPECIFIC_RE.test(text);
}

function isEnGbLikeLang(lang: string | undefined): boolean {
  const l = normalizeLang(lang);
  return l === "en-gb" || l.startsWith("en-gb-");
}

function isEnUsLikeLang(lang: string | undefined): boolean {
  const l = normalizeLang(lang);
  return l === "en-us" || l.startsWith("en-us-");
}

/**
 * Heuristic: voice label often includes "UK", "British", "United Kingdom", or "en-GB" on some engines.
 * Avoids matching unrelated "uk" substrings in vendor strings where possible.
 */
function isBritishByVoiceName(name: string): boolean {
  const s = name.toLowerCase();
  if (s.includes("en-gb") || s.includes("en_gb") || s.includes("engb")) return true;
  if (/(^|\s)uk(\s|[-_])english|british|united kingdom|united_kingdom|scottish|welsh|english\s*\(uk\)|\bengb\b/.test(
    s
  ))
    return true;
  if (/(^|[^a-z0-9])uk([^a-z0-9]|$)/.test(s) && /english|en[\s._-]gb|voice|female|male|neural|premium/.test(s))
    return true;
  return false;
}

function isAmericanByVoiceName(name: string): boolean {
  const s = name.toLowerCase();
  if (s.includes("en-us") || s.includes("en_us")) return true;
  if (/\b(us english|american english|united states|u\.s\.\s*english)\b/.test(s)) return true;
  if (/(^|[^a-z0-9])us([^a-z0-9]|$)/.test(s) && /english|voice|female|male|neural|samantha|aaron|allison|fiona/.test(s))
    return true;
  return false;
}

/**
 * True for typical English speech engines (en, en-*, and empty with English-ish names).
 * Exported for the English-only speech picker; same rules as TTS English ranking.
 */
export function isEnglishSpeechSynthesisVoice(v: Pick<SpeechSynthesisVoice, "name" | "lang">): boolean {
  const l = normalizeLang(v.lang);
  if (l === "en" || l.startsWith("en-")) return true;
  if (!l) {
    return (
      isBritishByVoiceName(v.name) ||
      isAmericanByVoiceName(v.name) ||
      /(^|\s)english($|\s|[-_])/.test(v.name.toLowerCase())
    );
  }
  return false;
}

/**
 * Persona / novelty engines (e.g. Apple character voices) — excluded from the study picker
 * and from automatic English ranking when other English voices exist.
 */
export function isNoveltyOrCharacterSpeechVoice(v: Pick<SpeechSynthesisVoice, "name">): boolean {
  const n = (v.name || "").trim().toLowerCase();
  if (/\bgrandma\b/.test(n) || /\bgrandpa\b/.test(n)) return true;
  if (/\beddy\b/.test(n) || /\brocko\b/.test(n)) return true;
  return false;
}

/** English voices shown in the speaking-voice picker and preferred for Auto English TTS. */
export function isStudyPickerEligibleSpeechVoice(v: SpeechSynthesisVoice): boolean {
  return isEnglishSpeechSynthesisVoice(v) && !isNoveltyOrCharacterSpeechVoice(v);
}

function englishVoicesForStudyOrAuto(voices: ReadonlyArray<SpeechSynthesisVoice>): SpeechSynthesisVoice[] {
  const allEn = voices.filter(isEnglishSpeechSynthesisVoice);
  const study = allEn.filter((v) => !isNoveltyOrCharacterSpeechVoice(v));
  return study.length > 0 ? study : allEn;
}

/**
 * Infers likely female from voice *name* only; Web Speech does not expose gender in API.
 * Conservative: "female" token, "woman", etc., so we do not misfire on "male" inside "female".
 */
function isLikelyFemaleByVoiceName(name: string): boolean {
  const s = name.toLowerCase();
  if (s.includes("female") || s.includes("woman") || s.includes("girl") || s.includes("lady") || s.includes("sister"))
    return true;
  if (/(^|[^a-z0-9])she([^a-z0-9]|$)/.test(s) && (s.includes("voice") || s.includes("english") || s.includes("google")))
    return true;
  return false;
}

/**
 * Infers likely male; excludes "female" matches. Note: the substring "male" appears
 * inside "female", so we use word-boundary or explicit "male" as a label token, not
 * a bare `includes("male")`.
 */
function isLikelyMaleByVoiceName(name: string): boolean {
  if (isLikelyFemaleByVoiceName(name)) return false;
  const s = name.toLowerCase();
  if (/(^|[^a-z0-9])male([^a-z0-9]|$)/.test(s) || s.startsWith("male ") || s.endsWith(" male") || s.includes(" male "))
    return true;
  if (/(^|[^a-z0-9])man([^a-z0-9]|$)/.test(s) || s.includes(" man ")) return true;
  if (/(^|[^a-z0-9])(boy|guy|gentleman|father)([^a-z0-9]|$)/.test(s)) return true;
  if (s.includes("father") && (s.includes("voice") || s.includes("neural") || s.includes("english"))) return true;
  return false;
}

export type EnglishTtsPreference = "default" | "british" | "american";

export function normalizeEnglishTtsPreference(
  raw: string | null | undefined
): EnglishTtsPreference {
  if (raw === "british" || raw === "american" || raw === "default") return raw;
  return "default";
}

export type VoiceStylePreference = "default" | "female" | "male";

export function normalizeVoiceStylePreference(
  raw: string | null | undefined
): VoiceStylePreference {
  if (raw === "female" || raw === "male" || raw === "default") return raw;
  return "default";
}

export function normalizeSpeechVoiceKey(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "";
  return String(raw).trim().slice(0, 512);
}

let playingKey: string | null = null;
const listeners = new Set<() => void>();
let opSeq = 0;

function notify() {
  listeners.forEach((cb) => cb());
}

function nextOp() {
  opSeq += 1;
  return opSeq;
}

export function isSpeechSynthesisAvailable(): boolean {
  return (
    typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined" && "SpeechSynthesisUtterance" in window
  );
}

export function getFlashcardSpeechPlayingKey(): string | null {
  return playingKey;
}

export function subscribeFlashcardSpeechState(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Block display math: do not read LaTeX source aloud (replaced with space, then normalized). */
function removeBlockDollarDisplayMath(s: string): string {
  return s.replace(/\$\$[\s\S]*?\$\$/g, " ");
}

/** Strips light markdown/whitespace; `$$...$$` block math is removed (not spoken). */
export function plainTextForSpeech(s: string): string {
  const noBlockMath = removeBlockDollarDisplayMath(s);
  const withPythonSpeakable = replaceInlinePythonBackticksForSpeech(
    replacePythonFencedBlocksForSpeech(noBlockMath)
  );
  return withPythonSpeakable
    .replace(/\u2192/g, " to ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/\*+/g, "")
    .replace(/`+/g, "")
    .replace(/\n+/g, " ")
    /** Web Speech often reads `_` as “underscore”; treat runs as word separators for natural read-aloud. */
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Plain segments for the answer in read mode: main text, then optional example body
 * (same `Example:` / `Examples:` heuristics as import). Block `$$` math stripped per segment.
 */
export function buildReadCardAnswerPlainSegments(rawAnswer: string): string[] {
  const a1 = removeBlockDollarDisplayMath(rawAnswer);
  const { main, example } = splitImportAnswerOnExampleMarker(a1);
  const pMain = plainTextForSpeech(main);
  const pEx = example != null ? plainTextForSpeech(example) : null;
  if (pEx) {
    if (pMain) return [pMain, pEx];
    return [pEx];
  }
  if (pMain) return [pMain];
  return [];
}

/**
 * Best-effort gender/style: prefers names that suggest female or male, else first in list.
 * Never returns null for non-empty `ordered` when at least one voice is present.
 */
function applyVoiceStylePreference(
  ordered: ReadonlyArray<SpeechSynthesisVoice>,
  style: VoiceStylePreference
): SpeechSynthesisVoice | null {
  if (ordered.length === 0) return null;
  if (style === "default") return ordered[0] ?? null;
  if (style === "female") {
    return ordered.find((v) => isLikelyFemaleByVoiceName(v.name)) || (ordered[0] ?? null);
  }
  return ordered.find((v) => isLikelyMaleByVoiceName(v.name)) || (ordered[0] ?? null);
}

function pickEnglishVoiceDefault(enVoices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (enVoices.length === 0) return null;
  if (enVoices.length === 1) return enVoices[0] ?? null;
  const a = enVoices.find((v) => /^en(-|_|$)/i.test(normalizeLang(v.lang)));
  if (a) return a;
  const b = enVoices.find((v) => normalizeLang(v.lang).startsWith("en-"));
  if (b) return b;
  return enVoices[0] ?? null;
}

/**
 * Tiers: best accent match first; within each tier we can filter by `voiceStyle` in the caller
 * (applyVoiceStylePreference) before falling back to the next tier.
 */
function buildEnglishAccentTiers(
  enVoices: SpeechSynthesisVoice[],
  mode: EnglishTtsPreference
): SpeechSynthesisVoice[][] {
  const inSet = (s: Set<string>, v: SpeechSynthesisVoice) => s.has(voiceKey(v));

  if (mode === "british") {
    const t1 = enVoices.filter((v) => isEnGbLikeLang(v.lang));
    const t1k = new Set(t1.map(voiceKey));
    const t2 = enVoices.filter((v) => !inSet(t1k, v) && isBritishByVoiceName(v.name));
    const t12k = new Set([...t1, ...t2].map(voiceKey));
    const t3 = enVoices.filter((v) => !inSet(t12k, v));
    return [t1, t2, t3].filter((t) => t.length > 0);
  }
  if (mode === "american") {
    const t1 = enVoices.filter((v) => isEnUsLikeLang(v.lang));
    const t1k = new Set(t1.map(voiceKey));
    const t2 = enVoices.filter((v) => !inSet(t1k, v) && isAmericanByVoiceName(v.name));
    const t12k = new Set([...t1, ...t2].map(voiceKey));
    const t3 = enVoices.filter((v) => !inSet(t12k, v));
    return [t1, t2, t3].filter((t) => t.length > 0);
  }
  const def = pickEnglishVoiceDefault(enVoices);
  if (!def) return [enVoices];
  const dk = new Set([voiceKey(def)]);
  const t2 = enVoices.filter((v) => !inSet(dk, v));
  if (t2.length === 0) return [[def]];
  return [[def], t2];
}

function pickEnglishByPreference(
  voices: ReadonlyArray<SpeechSynthesisVoice>,
  mode: EnglishTtsPreference,
  style: VoiceStylePreference
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const enVoices = englishVoicesForStudyOrAuto(voices);
  if (enVoices.length === 0) {
    const fallback = voices.filter((v) => {
      if (!v.lang) return false;
      const L = normalizeLang(v.lang);
      return L === "en" || L.startsWith("en-");
    });
    if (fallback.length === 0) return null;
    return applyVoiceStylePreference(fallback, style);
  }
  const tiers = buildEnglishAccentTiers(enVoices, mode);
  for (const tier of tiers) {
    if (tier.length === 0) continue;
    const p = applyVoiceStylePreference(tier, style);
    if (p) return p;
  }
  return enVoices[0] ?? null;
}

export type PickVoiceForTextOptions = {
  englishTts?: EnglishTtsPreference;
  voiceStyle?: VoiceStylePreference;
  /** If set, this browser voice (see `getSpeechVoiceKey`) wins over accent/style heuristics. */
  speechVoiceKey?: string;
};

/**
 * Heuristic text language label for TTS debug logs (not a strict CLD).
 */
export function detectTextLanguageForTts(plain: string): string {
  const t = (plain || "").trim();
  if (CJK_RE.test(t) || /[\u0400-\u04FF]/.test(t) || /[\u0590-\u05FF]/.test(t)) {
    if (CJK_RE.test(t)) return "CJK (no local voice pick)";
    if (/[\u0400-\u04FF]/.test(t)) return "Cyrillic (no local voice pick)";
    return "Hebrew (no local voice pick)";
  }
  if (isLikelyFarsiCardText(t) && RTL_SCRIPT_RE.test(t)) {
    return "Farsi (likely)";
  }
  if (RTL_SCRIPT_RE.test(t)) {
    return "RTL Arabic script (shared block)";
  }
  if (/[a-zA-Z]{2,}/.test(t)) {
    return "Latin/English (heuristics apply)";
  }
  return "Other / short";
}

/**
 * Picks a voice for en / fa (and rough RTL/CJK heuristics). For English, uses
 * `englishTts` and `voiceStyle` from user settings. Gender hints use voice names only; always falls back.
 */
export function pickVoiceForText(
  text: string,
  voices: ReadonlyArray<SpeechSynthesisVoice>,
  options: PickVoiceForTextOptions = {}
): SpeechSynthesisVoice | null {
  const englishTts = options.englishTts ?? "default";
  const voiceStyle = options.voiceStyle ?? "default";
  if (!voices.length) return null;
  const t = (text || "").trim();
  if (CJK_RE.test(t) || /[\u0400-\u04FF]/.test(t) || /[\u0590-\u05FF]/.test(t)) {
    return null;
  }
  if (RTL_SCRIPT_RE.test(t)) {
    return pickFarsiOrRtlSpeechVoice(voices, voiceStyle);
  }
  if (/[a-zA-Z]{2,}/.test(t)) {
    return pickEnglishByPreference(voices, englishTts, voiceStyle);
  }
  return null;
}

type VoiceResolution =
  | "user_picker"
  | "preference"
  | "preference_auto_english_lang_only"
  | "user_picker_unavailable"
  | "browser_default";

export function resolveFlashcardVoice(
  plain: string,
  voiceList: ReadonlyArray<SpeechSynthesisVoice>,
  options: PickVoiceForTextOptions
): { voice: SpeechSynthesisVoice | null; resolution: VoiceResolution; hadUserKey: boolean } {
  const userKey = normalizeSpeechVoiceKey(options.speechVoiceKey);
  if (userKey) {
    const v = voiceList.find((x) => voiceKey(x) === userKey) ?? null;
    if (v && isStudyPickerEligibleSpeechVoice(v)) {
      return { voice: v, resolution: "user_picker", hadUserKey: true };
    }
  }
  const vAlgo = pickVoiceForText(plain, voiceList, { ...options, speechVoiceKey: undefined });
  if (userKey && !vAlgo) {
    return { voice: null, resolution: "user_picker_unavailable", hadUserKey: true };
  }
  if (userKey) {
    return { voice: vAlgo, resolution: "user_picker_unavailable", hadUserKey: true };
  }
  if (!vAlgo) {
    return { voice: null, resolution: "browser_default", hadUserKey: false };
  }
  return { voice: vAlgo, resolution: "preference", hadUserKey: false };
}

type TtsSelectionLogMeta = {
  /** When Auto English skips `utterance.voice`, voice `pickVoiceForText` would have ranked (debug only). */
  referenceHeuristicVoice?: SpeechSynthesisVoice | null;
  /** `utterance.lang` applied for accent (undefined = left unset). */
  utteranceLangHint?: string | undefined;
  /** Auto + explicit Female/Male: engine name did not match style heuristics (tier fallback to first voice). */
  voiceStyleHeuristicMiss?: boolean;
  voiceStyleRequested?: VoiceStylePreference;
};

function voiceNameMatchesStylePreference(name: string, style: VoiceStylePreference): boolean {
  if (style === "default") return true;
  if (style === "female") return isLikelyFemaleByVoiceName(name);
  return isLikelyMaleByVoiceName(name);
}

/** Logs TTS voice resolution in development only (no user-facing UI). */
function logTtsSelection(
  plain: string,
  voice: SpeechSynthesisVoice | null,
  resolution: VoiceResolution,
  meta?: TtsSelectionLogMeta
) {
  const detectedTextLanguage = detectTextLanguageForTts(plain);
  const voiceName = voice?.name?.trim() || "";
  const voiceLang = (voice?.lang && voice.lang.trim()) || "";
  const resLabel =
    resolution === "user_picker"
      ? "user_picker (specific voice in settings)"
      : resolution === "user_picker_unavailable"
        ? "fallback (saved voice not on this device; preference-based)"
        : resolution === "preference"
          ? "preference (accent / language heuristics)"
          : resolution === "preference_auto_english_lang_only"
            ? "Auto English: utterance.voice unset (browser/system default); lang accent hint only"
            : "browser_default (no matching engine voice; utterance may use system default)";

  const utteranceVoiceExplicit =
    resolution !== "preference_auto_english_lang_only" && voice != null;

  if (_DEV && typeof console !== "undefined" && console.info) {
    const payload: Record<string, unknown> = {
      detectedTextLanguage,
      resolution: resLabel,
      utteranceVoiceExplicit,
    };
    if (resolution === "preference_auto_english_lang_only") {
      payload.utteranceLangHint = meta?.utteranceLangHint ?? "(unset)";
      payload.rankedHeuristicVoice = meta?.referenceHeuristicVoice
        ? `${meta.referenceHeuristicVoice.name} (${meta.referenceHeuristicVoice.lang || ""})`
        : null;
    } else {
      payload.boundVoice = voice ? `${voice.name} (${voice.lang || ""})` : null;
      payload.voiceName = voiceName || "(default)";
      payload.voiceLang = voiceLang || "(default)";
      if (meta?.voiceStyleHeuristicMiss) {
        payload.voiceStyleHeuristicMiss = true;
        payload.voiceStyleRequested = meta.voiceStyleRequested;
        payload.voiceStyleNote =
          "No engine name matched Female/Male in the accent tier; first voice in tier was used.";
      }
    }
    console.info("[flashcard TTS] selection", payload);
  }
}

function applyPickedVoiceToUtterance(
  ut: SpeechSynthesisUtterance,
  plain: string,
  voiceList: ReadonlyArray<SpeechSynthesisVoice>,
  options: PickVoiceForTextOptions
): SpeechSynthesisVoice | null {
  const userKey = normalizeSpeechVoiceKey(options.speechVoiceKey);
  const { voice, resolution } = resolveFlashcardVoice(plain, voiceList, options);

  const voiceStyle = options.voiceStyle ?? "default";
  const autoEnglishLangOnly =
    !userKey &&
    voice &&
    resolution === "preference" &&
    voiceStyle === "default" &&
    isPlainEnglishPreferencePath(plain);

  if (autoEnglishLangOnly) {
    const hint = langHintForAutoEnglishWithoutVoice(options.englishTts);
    if (hint) ut.lang = hint;
    logTtsSelection(plain, null, "preference_auto_english_lang_only", {
      referenceHeuristicVoice: voice,
      utteranceLangHint: hint,
    });
    return null;
  }

  if (voice) {
    ut.voice = voice;
    ut.lang = voice.lang;
  } else if (RTL_SCRIPT_RE.test(plain) && !CJK_RE.test(plain) && !/[\u0400-\u04FF]/.test(plain) && !/[\u0590-\u05FF]/.test(plain)) {
    ut.lang = isLikelyFarsiCardText(plain) ? "fa-IR" : "ar";
  }

  let logMeta: TtsSelectionLogMeta | undefined;
  if (
    _DEV &&
    !userKey &&
    voice &&
    resolution === "preference" &&
    isPlainEnglishPreferencePath(plain) &&
    (voiceStyle === "female" || voiceStyle === "male") &&
    !voiceNameMatchesStylePreference(voice.name, voiceStyle)
  ) {
    logMeta = { voiceStyleHeuristicMiss: true, voiceStyleRequested: voiceStyle };
  }

  logTtsSelection(plain, voice, resolution, logMeta);
  return voice;
}

function getVoicesAsync(): Promise<ReadonlyArray<SpeechSynthesisVoice>> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve([]);
      return;
    }
    const synth = window.speechSynthesis;
    const v = synth.getVoices();
    if (v.length) {
      resolve(v);
      return;
    }
    const onV = () => {
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", onV, { once: true });
  });
}

export function cancelAllFlashcardSpeech(): void {
  nextOp();
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
  playingKey = null;
  notify();
}

type SpeakOrToggleResult = "started" | "stopped" | "skipped";

export type SpeakOrToggleOptions = {
  /** User setting for English card text; ignored for non-English heuristics except as documented. */
  englishTts?: EnglishTtsPreference;
  /** Best-effort voice style from user settings (name heuristics). */
  voiceStyle?: VoiceStylePreference;
  /**
   * Optional voice from user settings (`getSpeechVoiceKey`). When set and the voice exists
   * on the device, it overrides accent/style heuristics for that utterance.
   */
  speechVoiceKey?: string;
};

/**
 * If the same `utteranceKey` is already playing, stops. Otherwise cancels the queue and
 * starts speaking `text`. Returns "skipped" when nothing to say or the API is missing.
 */
export function speakOrToggle(
  utteranceKey: string,
  text: string,
  options?: SpeakOrToggleOptions
): SpeakOrToggleResult {
  const englishTts = options?.englishTts ?? "default";
  const voiceStyle = options?.voiceStyle ?? "default";
  const speechVoiceKey = options?.speechVoiceKey;
  if (!isSpeechSynthesisAvailable()) return "skipped";
  const plain = plainTextForSpeech(text);
  if (!plain) return "skipped";

  if (playingKey === utteranceKey) {
    nextOp();
    try {
      window.speechSynthesis!.cancel();
    } catch {
      /* ignore */
    }
    playingKey = null;
    notify();
    return "stopped";
  }

  const myOp = nextOp();
  try {
    window.speechSynthesis!.cancel();
  } catch {
    /* ignore */
  }
  playingKey = utteranceKey;
  notify();

  getVoicesAsync().then((voiceList) => {
    if (myOp !== opSeq) return;
    const synth = window.speechSynthesis!;
    if (!plainTextForSpeech(text)) {
      if (myOp === opSeq) {
        playingKey = null;
        notify();
      }
      return;
    }
    const ut = new SpeechSynthesisUtterance(plain);
    applyPickedVoiceToUtterance(ut, plain, voiceList, { englishTts, voiceStyle, speechVoiceKey });
    /* else: browser default voice, including CJK and other languages (logging in apply) */
    const done = () => {
      if (myOp === opSeq) {
        playingKey = null;
        notify();
      }
    };
    ut.onend = done;
    ut.onerror = done;
    try {
      synth.speak(ut);
    } catch {
      if (myOp === opSeq) {
        playingKey = null;
        notify();
      }
    }
  });

  return "started";
}

/** Short pause (ms) between question and answer on the Read tab full-card TTS. */
export const READ_CARD_PAUSE_MS = 450;

/**
 * Pause (ms) between the main answer text and a following Example section — shorter than
 * {@link READ_CARD_PAUSE_MS} but enough to mark the transition when both parts are read.
 */
export const READ_ANSWER_EXAMPLE_PAUSE_MS = 240;

/**
 * Read tab: speak the question, pause, then the answer, using one `utteranceKey`
 * (toggle the same key to stop; same as `speakOrToggle` for that key).
 * Each segment gets its own voice pick for mixed-language cards.
 */
export function speakOrToggleReadCard(
  utteranceKey: string,
  question: string,
  answer: string,
  options?: SpeakOrToggleOptions
): SpeakOrToggleResult {
  const englishTts = options?.englishTts ?? "default";
  const voiceStyle = options?.voiceStyle ?? "default";
  const speechVoiceKey = options?.speechVoiceKey;
  if (!isSpeechSynthesisAvailable()) return "skipped";
  const plainQ = plainTextForSpeech(question);
  const answerParts = buildReadCardAnswerPlainSegments(answer);
  if (!plainQ && answerParts.length === 0) return "skipped";

  if (playingKey === utteranceKey) {
    nextOp();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    playingKey = null;
    notify();
    return "stopped";
  }

  const myOp = nextOp();
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  playingKey = utteranceKey;
  notify();

  getVoicesAsync().then((voiceList) => {
    if (myOp !== opSeq) return;
    const synth = window.speechSynthesis!;
    const endSession = () => {
      if (myOp === opSeq) {
        playingKey = null;
        notify();
      }
    };

    const speakOneAnswerPart = (part: string, onEnd: () => void) => {
      const ut2 = new SpeechSynthesisUtterance(part);
      applyPickedVoiceToUtterance(ut2, part, voiceList, { englishTts, voiceStyle, speechVoiceKey });
      ut2.onend = onEnd;
      ut2.onerror = endSession;
      try {
        synth.speak(ut2);
      } catch {
        endSession();
      }
    };

    const runAnswerParts = (startIndex: number) => {
      if (myOp !== opSeq) return;
      if (startIndex >= answerParts.length) {
        endSession();
        return;
      }
      const gapMs = startIndex > 0 ? READ_ANSWER_EXAMPLE_PAUSE_MS : 0;
      const doSpeak = () => {
        if (myOp !== opSeq) return;
        const part = answerParts[startIndex]!;
        speakOneAnswerPart(part, () => {
          if (myOp !== opSeq) return;
          runAnswerParts(startIndex + 1);
        });
      };
      if (gapMs > 0) {
        window.setTimeout(() => {
          if (myOp !== opSeq) return;
          doSpeak();
        }, gapMs);
      } else {
        doSpeak();
      }
    };

    const beginAnswer = () => {
      if (myOp !== opSeq) return;
      if (answerParts.length === 0) {
        endSession();
        return;
      }
      runAnswerParts(0);
    };

    if (!plainQ) {
      beginAnswer();
      return;
    }
    if (answerParts.length === 0) {
      const ut = new SpeechSynthesisUtterance(plainQ);
      applyPickedVoiceToUtterance(ut, plainQ, voiceList, { englishTts, voiceStyle, speechVoiceKey });
      ut.onend = endSession;
      ut.onerror = endSession;
      try {
        synth.speak(ut);
      } catch {
        endSession();
      }
      return;
    }
    const ut1 = new SpeechSynthesisUtterance(plainQ);
    applyPickedVoiceToUtterance(ut1, plainQ, voiceList, { englishTts, voiceStyle, speechVoiceKey });
    ut1.onend = () => {
      if (myOp !== opSeq) return;
      window.setTimeout(() => {
        if (myOp !== opSeq) return;
        beginAnswer();
      }, READ_CARD_PAUSE_MS);
    };
    ut1.onerror = endSession;
    try {
      synth.speak(ut1);
    } catch {
      endSession();
    }
  });

  return "started";
}

/** `playingKey` for sequential Read-tab autoplay (one card at a time, no toggle). */
export const READ_TAB_AUTOPLAY_KEY = "readTabAutoplay";

/**
 * Pause (ms) after a card’s answer finishes, before auto-advancing to the next card.
 * Pair with `READ_CARD_PAUSE_MS` (between Q and A).
 */
export const READ_SLIDESHOW_GAP_MS = 1100;

/**
 * Plays the same sequence as the Read tab full card (Q → short pause → A) once, without
 * toggle behavior. Resolves when speech finishes, is cancelled, or is superseded by another op.
 * Cancels any prior TTS. Sets `playingKey` to `READ_TAB_AUTOPLAY_KEY` for the session.
 */
export function playReadCardOnceForAutoplay(
  question: string,
  answer: string,
  options?: SpeakOrToggleOptions
): Promise<"ok" | "aborted"> {
  if (!isSpeechSynthesisAvailable()) {
    return Promise.resolve("aborted");
  }
  const englishTts = options?.englishTts ?? "default";
  const voiceStyle = options?.voiceStyle ?? "default";
  const speechVoiceKey = options?.speechVoiceKey;
  const plainQ = plainTextForSpeech(question);
  const answerParts = buildReadCardAnswerPlainSegments(answer);
  if (!plainQ && answerParts.length === 0) {
    return Promise.resolve("ok");
  }

  return new Promise((resolve) => {
    const myOp = nextOp();
    let settled = false;
    const settle = (r: "ok" | "aborted") => {
      if (settled) return;
      settled = true;
      if (playingKey === READ_TAB_AUTOPLAY_KEY) {
        playingKey = null;
        notify();
      }
      resolve(r);
    };

    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    playingKey = READ_TAB_AUTOPLAY_KEY;
    notify();

    getVoicesAsync().then((voiceList) => {
      if (myOp !== opSeq) {
        settle("aborted");
        return;
      }
      const synth = window.speechSynthesis!;

      const speakAnswerPart = (text: string, onDone: () => void) => {
        const ut2 = new SpeechSynthesisUtterance(text);
        applyPickedVoiceToUtterance(ut2, text, voiceList, { englishTts, voiceStyle, speechVoiceKey });
        ut2.onend = onDone;
        ut2.onerror = onDone;
        try {
          synth.speak(ut2);
        } catch {
          onDone();
        }
      };

      const runAnswerParts = (index: number) => {
        if (myOp !== opSeq) {
          settle("aborted");
          return;
        }
        if (index >= answerParts.length) {
          if (myOp === opSeq) settle("ok");
          else settle("aborted");
          return;
        }
        const gapMs = index > 0 ? READ_ANSWER_EXAMPLE_PAUSE_MS : 0;
        const doneThis = () => {
          if (myOp !== opSeq) {
            settle("aborted");
            return;
          }
          runAnswerParts(index + 1);
        };
        if (gapMs > 0) {
          window.setTimeout(() => {
            if (myOp !== opSeq) {
              settle("aborted");
              return;
            }
            speakAnswerPart(answerParts[index]!, doneThis);
          }, gapMs);
        } else {
          speakAnswerPart(answerParts[index]!, doneThis);
        }
      };

      const beginAnswer = () => {
        if (myOp !== opSeq) {
          settle("aborted");
          return;
        }
        if (answerParts.length === 0) {
          settle("ok");
          return;
        }
        runAnswerParts(0);
      };

      if (!plainQ) {
        beginAnswer();
        return;
      }
      if (answerParts.length === 0) {
        const ut = new SpeechSynthesisUtterance(plainQ);
        applyPickedVoiceToUtterance(ut, plainQ, voiceList, { englishTts, voiceStyle, speechVoiceKey });
        const onUtDone = () => {
          if (myOp === opSeq) settle("ok");
          else settle("aborted");
        };
        ut.onend = onUtDone;
        ut.onerror = onUtDone;
        try {
          synth.speak(ut);
        } catch {
          settle("aborted");
        }
        return;
      }
      const ut1 = new SpeechSynthesisUtterance(plainQ);
      applyPickedVoiceToUtterance(ut1, plainQ, voiceList, { englishTts, voiceStyle, speechVoiceKey });
      ut1.onend = () => {
        if (myOp !== opSeq) {
          settle("aborted");
          return;
        }
        window.setTimeout(() => {
          if (myOp !== opSeq) {
            settle("aborted");
            return;
          }
          beginAnswer();
        }, READ_CARD_PAUSE_MS);
      };
      ut1.onerror = () => settle("aborted");
      try {
        synth.speak(ut1);
      } catch {
        settle("aborted");
      }
    });
  });
}

/**
 * useSyncExternalStore for React: subscribe to global "which key is playing".
 */
function getSnapshot() {
  return getFlashcardSpeechPlayingKey();
}
function getServerSnapshot() {
  return null;
}

export const flashcardSpeechStore = {
  getSnapshot,
  getServerSnapshot,
  subscribe: subscribeFlashcardSpeechState,
};
