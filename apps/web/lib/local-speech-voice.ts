/**
 * Per-browser device speaking voice (Web Speech API engine id).
 * Not synced to the account — use account settings for accent, language, and style.
 */
const PREFIX = "flashcard_device_speech_voice_v1:";

export const LOCAL_SPEECH_VOICE_CHANGED = "flashcard_device_speech_voice_changed";

export function localSpeechVoiceStorageKey(userId: string): string {
  return `${PREFIX}${userId}`;
}

function safeRead(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    const v = window.localStorage.getItem(key);
    return typeof v === "string" ? v.trim() : "";
  } catch {
    return "";
  }
}

export function getLocalSpeechVoiceKey(userId: string | null | undefined): string {
  if (!userId?.trim()) return "";
  return safeRead(localSpeechVoiceStorageKey(userId.trim()));
}

export function setLocalSpeechVoiceKey(userId: string, key: string): void {
  if (typeof window === "undefined" || !userId.trim()) return;
  const k = localSpeechVoiceStorageKey(userId.trim());
  const next = (key || "").trim();
  try {
    if (next) {
      window.localStorage.setItem(k, next.slice(0, 512));
    } else {
      window.localStorage.removeItem(k);
    }
    window.dispatchEvent(new Event(LOCAL_SPEECH_VOICE_CHANGED));
  } catch {
    /* private mode or quota */
  }
}

export function subscribeLocalSpeechVoiceKey(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => onChange();
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(PREFIX)) onChange();
  };
  window.addEventListener(LOCAL_SPEECH_VOICE_CHANGED, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LOCAL_SPEECH_VOICE_CHANGED, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * One-time: if the user has a legacy account `speech_voice` and no local value yet, copy to localStorage.
 * Does not write to the server.
 */
export function migrateAccountSpeechVoiceToLocal(
  userId: string | null | undefined,
  accountSpeechVoice: string | null | undefined
): void {
  if (!userId?.trim()) return;
  const acc = (accountSpeechVoice ?? "").trim();
  if (!acc) return;
  if (getLocalSpeechVoiceKey(userId)) return;
  setLocalSpeechVoiceKey(userId, acc);
}
