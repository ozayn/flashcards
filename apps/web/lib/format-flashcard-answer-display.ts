/**
 * Display-only formatting for flashcard answers (study, modal, deck list).
 * Does not mutate stored content.
 */

/** Gap to insert immediately before `Example:` / `Examples:` when needed. */
function paragraphGapBeforeExample(before: string): string {
  if (!before.trim()) return "";
  const t = before.replace(/\r\n/g, "\n");
  if (/\n\n\s*$/.test(t)) return "";
  if (/\n\s*$/.test(t)) return "\n";
  return "\n\n";
}

/**
 * Ensure `Example:` / `Examples:` begins a new paragraph when it follows definition text
 * on the same line or after a single newline. Uses word-boundary so mid-word tokens are not split.
 */
export function applyExampleParagraphBreaks(text: string): string {
  if (!text) return text;
  const full = text.replace(/\r\n/g, "\n");
  /* Drop horizontal space before the marker so "foo. Example:" becomes "foo.\n\nExample:" not "foo. \n\n". */
  return full.replace(
    /[ \t\f\v]*(\bExamples?:\s)/gi,
    (fullMatch, label: string, offset: number, string: string) => {
      const before = string.slice(0, offset);
      return paragraphGapBeforeExample(before) + label;
    }
  );
}

export type ParsedAnswerParagraph =
  | { type: "plain"; text: string }
  | { type: "example"; label: "Ex." | "Exs."; body: string };

/**
 * Split answer display into paragraphs (after inline Example breaks), and detect
 * paragraphs that *begin* with Example:/Examples: for abbreviated label rendering.
 */
export function parseAnswerParagraphs(rawText: string): ParsedAnswerParagraph[] {
  if (!rawText.trim()) return [];
  const normalized = applyExampleParagraphBreaks(rawText.replace(/\r\n/g, "\n"));
  const paras = normalized
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return paras.map((para) => {
    const m = para.match(/^(Examples?)\s*:\s*([\s\S]*)$/i);
    if (!m) return { type: "plain" as const, text: para };
    const label: "Ex." | "Exs." = /^examples$/i.test(m[1] ?? "") ? "Exs." : "Ex.";
    const body = (m[2] ?? "").replace(/^\s+/, "");
    return { type: "example" as const, label, body };
  });
}

/**
 * Compose primary answer for display: core definition (`answer_short`) plus optional
 * `answer_example` as its own Example block (matches parseAnswerParagraphs styling).
 */
export function buildAnswerDisplayText(
  answerShort: string,
  answerExample?: string | null
): string {
  const core = (answerShort || "").replace(/\r\n/g, "\n").trimEnd();
  const ex = (answerExample || "").replace(/\r\n/g, "\n").trim();
  if (!ex) return core;
  if (!core) return `Example:\n${ex}`;
  return `${core}\n\nExample:\n${ex}`;
}

/** Whether to show the separate detailed/notes field below the main answer. */
export function shouldShowAnswerDetailed(
  answerDetailed: string | null | undefined,
  answerShort: string,
  answerExample?: string | null
): boolean {
  const d = (answerDetailed || "").replace(/\r\n/g, "\n").trim();
  if (!d) return false;
  const shortTrim = (answerShort || "").replace(/\r\n/g, "\n").trim();
  const exTrim = (answerExample || "").replace(/\r\n/g, "\n").trim();
  if (d === shortTrim) return false;
  if (d === exTrim) return false;
  if (d === buildAnswerDisplayText(answerShort, answerExample).trim()) return false;
  return true;
}
