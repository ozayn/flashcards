/**
 * Client-side TTS for flashcards via the Web Speech API.
 * New utterances cancel prior playback; `speakOrToggle` stops if the same key is playing.
 */

const RTL_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const CJK_RE = /[\u3040-\u30ff\u31f0-\u31ff\u4e00-\u9fff\uac00-\ud7af]/;

/** Letters used in Persian (Farsi) that standard Arabic does not use — strong signal the card is Farsi, not Arabic. */
const PERSIAN_SPECIFIC_RE = /[\u06A9\u06AF\u067E\u0686\u0698\u06A4\u06B5\u06B7]/;

const _DEV =
  typeof process !== "undefined" && process.env && process.env.NODE_ENV === "development";

function voiceKey(v: SpeechSynthesisVoice): string {
  return `${v.voiceURI}|${v.name}|${v.lang || ""}`;
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

/** True for typical English speech engines (en, en-*, and empty with English-ish names). */
function isEnglishLanguageVoice(v: SpeechSynthesisVoice): boolean {
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

/** Strips light markdown/whitespace; extend later for heavier markup if needed. */
export function plainTextForSpeech(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/\*+/g, "")
    .replace(/`+/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const enVoices = voices.filter(isEnglishLanguageVoice);
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
};

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
    const voice = pickVoiceForText(plain, voiceList, { englishTts, voiceStyle });
    if (_DEV && typeof console !== "undefined" && console.info) {
      const textLangHint = (() => {
        if (CJK_RE.test(plain) || /[\u0400-\u04FF]/.test(plain) || /[\u0590-\u05FF]/.test(plain)) {
          return CJK_RE.test(plain) ? "cjk (no voice pick)" : "cyrillic/hebrew (no voice pick)";
        }
        if (isLikelyFarsiCardText(plain) && RTL_SCRIPT_RE.test(plain)) return "farsi (persian letters)";
        if (RTL_SCRIPT_RE.test(plain)) return "rtl_arabic_script (shared block)";
        if (/[a-zA-Z]{2,}/.test(plain)) return "latin/english heuristics";
        return "other";
      })();
      if (voice) {
        const accent =
          englishTts === "british"
            ? "accent=british"
            : englishTts === "american"
              ? "accent=american"
              : "accent=default";
        const style = voiceStyle === "female" || voiceStyle === "male" ? `, style=${voiceStyle}` : ", style=default";
        console.info(`[flashcard TTS] text=${textLangHint} | ${accent}${style}`, {
          name: voice.name,
          lang: voice.lang || "(empty)",
        });
      } else {
        console.info(`[flashcard TTS] text=${textLangHint} — no matching voice; using browser default`, {
          textPreview: plain.length > 80 ? `${plain.slice(0, 80)}…` : plain,
        });
      }
    }
    if (voice) {
      ut.voice = voice;
      ut.lang = voice.lang;
    } else if (RTL_SCRIPT_RE.test(plain) && !CJK_RE.test(plain) && !/[\u0400-\u04FF]/.test(plain) && !/[\u0590-\u05FF]/.test(plain)) {
      ut.lang = isLikelyFarsiCardText(plain) ? "fa-IR" : "ar";
    }
    /* else: browser default voice, including CJK and other languages */
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
