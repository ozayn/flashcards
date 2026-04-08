/**
 * Mirrors backend `app.utils.import_answer_split.split_import_answer_on_example_marker`
 * so Q/A import text is split consistently before POST /flashcards/import.
 */

const _LINE_LEADING_EXAMPLE = /^[\t\f\v ]*\bExamples?\s*:\s*/im;

const _AFTER_SENTENCE_EXAMPLE = /(?<=[.!?…])(\s+)(\bExamples?\s*:\s*)/gi;

/** Split answer text into main answer vs example body; conservative (matches API). */
export function splitImportAnswerOnExampleMarker(raw: string): {
  main: string;
  example: string | null;
} {
  if (raw == null || raw === "") {
    return { main: "", example: null };
  }
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const lineMatch = _LINE_LEADING_EXAMPLE.exec(text);
  if (lineMatch && lineMatch.index !== undefined) {
    const before = text.slice(0, lineMatch.index).trimEnd();
    const after = text.slice(lineMatch.index + lineMatch[0].length).replace(/^\s+/, "");
    if (before.trim() && after.trim()) {
      return { main: before.trim(), example: after.trim() };
    }
  }

  let m2: RegExpExecArray | null;
  _AFTER_SENTENCE_EXAMPLE.lastIndex = 0;
  while ((m2 = _AFTER_SENTENCE_EXAMPLE.exec(text)) !== null) {
    const gapStart = m2.index;
    const prefix = text.slice(0, gapStart).trimEnd();
    if (!prefix.trim()) continue;
    if (/\bfor\s*$/i.test(prefix.trimEnd())) continue;
    if (/\d\.\s*$/.test(prefix)) continue;
    if (/\b(?:e\.g\.|i\.e\.)\s*$/i.test(prefix)) continue;
    const after = text.slice(gapStart + m2[0].length).replace(/^\s+/, "");
    if (after.trim()) {
      return { main: prefix.trim(), example: after.trim() };
    }
  }

  return { main: text.trim(), example: null };
}
