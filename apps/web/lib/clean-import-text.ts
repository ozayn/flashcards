/**
 * Shared preprocessing for flashcard text import (paste, .txt upload, etc.).
 * Runs before Q:/A: and export-format parsers.
 */

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Line is only the same separator char repeated (optional surrounding whitespace). */
const SEPARATOR_ONLY_LINE = /^\s*([-_=*~#])\1+\s*$/;
/** Dashed dividers used by MemoNext .txt export (`---`, `--------------------------------------------------`, …). */
const DASHED_EXPORT_DIVIDER_LINE = /^\s*-{3,}\s*$/;

export type CleanImportTextOptions = {
  /**
   * Keep MemoNext export divider lines (`---` / long dashes). Required for
   * re-importing deck .txt exports; decorative `=`, `_`, `*`, `~`, `#` lines
   * are still removed.
   */
  preserveDashedDividers?: boolean;
};

/**
 * Normalize pasted / uploaded import text before parsing cards.
 *
 * - Trims each line
 * - Drops separator-only lines (`---`, `====`, `____`, `****`, `~~~~`, `####`, …)
 * - Collapses consecutive blank lines to one
 * - Preserves real flashcard content (Q:/A:, metadata, examples, …)
 */
export function cleanImportText(
  text: string,
  options: CleanImportTextOptions = {},
): string {
  const { preserveDashedDividers = false } = options;
  const lines = normalizeNewlines(text).split("\n");
  const out: string[] = [];
  let prevBlank = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (
      SEPARATOR_ONLY_LINE.test(line) &&
      !(preserveDashedDividers && DASHED_EXPORT_DIVIDER_LINE.test(line))
    ) {
      continue;
    }
    if (line.length === 0) {
      if (prevBlank) continue;
      out.push("");
      prevBlank = true;
      continue;
    }
    out.push(line);
    prevBlank = false;
  }

  while (out.length > 0 && out[0] === "") out.shift();
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}
