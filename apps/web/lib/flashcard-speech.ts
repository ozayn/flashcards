/**
 * Client-side TTS for flashcards via the Web Speech API.
 * New utterances cancel prior playback; `speakOrToggle` stops if the same key is playing.
 */

const RTL_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const CJK_RE = /[\u3040-\u30ff\u31f0-\u31ff\u4e00-\u9fff\uac00-\ud7af]/;

const _DEV =
  typeof process !== "undefined" && process.env && process.env.NODE_ENV === "development";

function normalizeLang(lang: string | undefined): string {
  return (lang || "").trim().toLowerCase().replace(/_/g, "-");
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

export type EnglishTtsPreference = "default" | "british" | "american";

export function normalizeEnglishTtsPreference(
  raw: string | null | undefined
): EnglishTtsPreference {
  if (raw === "british" || raw === "american" || raw === "default") return raw;
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
 * Picks a voice for en / fa (and rough RTL/CJK heuristics). For English, uses
 * `englishTts` from user settings: default = legacy neutral pick, british, american.
 */
export function pickVoiceForText(
  text: string,
  voices: ReadonlyArray<SpeechSynthesisVoice>,
  englishTts: EnglishTtsPreference = "default"
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const t = (text || "").trim();
  if (RTL_SCRIPT_RE.test(t)) {
    return (
      voices.find((v) => /^fa(-|$)/i.test(v.lang)) || voices.find((v) => /^ar(-|$)/i.test(v.lang) || v.lang === "ar") || null
    );
  }
  if (CJK_RE.test(t) || /[\u0400-\u04FF]/.test(t) || /[\u0590-\u05FF]/.test(t)) {
    return null;
  }
  if (/[a-zA-Z]{2,}/.test(t)) {
    return pickEnglishByPreference(voices, englishTts);
  }
  return null;
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

function pickEnglishVoiceBritish(enVoices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (enVoices.length === 0) return null;
  if (enVoices.length === 1) return enVoices[0] ?? null;
  const byLangGb = enVoices.find((v) => isEnGbLikeLang(v.lang));
  if (byLangGb) return byLangGb;
  const byNameUk = enVoices.find((v) => isBritishByVoiceName(v.name));
  if (byNameUk) return byNameUk;
  return enVoices[0] ?? null;
}

function pickEnglishVoiceAmerican(enVoices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (enVoices.length === 0) return null;
  if (enVoices.length === 1) return enVoices[0] ?? null;
  const byLangUs = enVoices.find((v) => isEnUsLikeLang(v.lang));
  if (byLangUs) return byLangUs;
  const byNameUs = enVoices.find((v) => isAmericanByVoiceName(v.name));
  if (byNameUs) return byNameUs;
  return enVoices[0] ?? null;
}

function pickEnglishByPreference(
  voices: ReadonlyArray<SpeechSynthesisVoice>,
  mode: EnglishTtsPreference
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const enVoices = voices.filter(isEnglishLanguageVoice);
  if (enVoices.length === 0) {
    return (
      voices.find((v) => {
        if (!v.lang) return false;
        const L = normalizeLang(v.lang);
        return L === "en" || L.startsWith("en-");
      }) || null
    );
  }
  switch (mode) {
    case "british":
      return pickEnglishVoiceBritish(enVoices);
    case "american":
      return pickEnglishVoiceAmerican(enVoices);
    default:
      return pickEnglishVoiceDefault(enVoices);
  }
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
  /** User setting for English card text; ignored for non-English heuristics. */
  englishTts?: EnglishTtsPreference;
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
    const voice = pickVoiceForText(plain, voiceList, englishTts);
    if (_DEV && typeof console !== "undefined" && console.info) {
      if (voice) {
        const modeLabel =
          englishTts === "british"
            ? "setting=british"
            : englishTts === "american"
              ? "setting=american"
              : "setting=default";
        console.info("[flashcard TTS]", modeLabel, {
          name: voice.name,
          lang: voice.lang || "(empty)",
        });
      } else {
        console.info(
          "[flashcard TTS]",
          "no matching voice; browser default for utterance (lang may be unset on some engines)"
        );
      }
    }
    if (voice) {
      ut.voice = voice;
      ut.lang = voice.lang;
    } else if (/[\u0600-\u06FF]/.test(plain)) {
      ut.lang = "fa";
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
