/**
 * Normalize caption / transcript language hints to ISO 639-1 when possible.
 */
export function normalizeLangCode(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (/^[a-z]{2}$/.test(lower)) return lower;
  const m = /^([a-z]{2})[-_]/i.exec(t);
  if (m) return m[1].toLowerCase();
  return null;
}

/** English display name for a BCP-47 / ISO code (best effort). */
export function languageDisplayName(iso639_1: string): string {
  const code = iso639_1.trim().toLowerCase().slice(0, 8);
  if (!code) return iso639_1;
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    const name = dn.of(code);
    if (name && name !== code) return name;
  } catch {
    /* ignore */
  }
  return code.toUpperCase();
}

export type GenerationLangPreference = "source" | "english";

/**
 * Build optional `language` field for generate-flashcards APIs.
 * - english → always "en"
 * - source + known hint → that ISO code
 * - source + no hint → omit (backend infers from text/topic)
 */
export function generationLanguagePayload(
  preference: GenerationLangPreference,
  sourceHint: string | null,
): { language?: string } {
  if (preference === "english") return { language: "en" };
  const h = sourceHint ? normalizeLangCode(sourceHint) : null;
  if (h) return { language: h };
  return {};
}

/** Label for the "source" segment when we know a concrete language. */
export function originalLanguageToggleLabel(sourceHint: string | null): string {
  const h = sourceHint ? normalizeLangCode(sourceHint) : null;
  if (h) return `Original (${languageDisplayName(h)})`;
  return "Original";
}
