/**
 * Parse plain-text Q/A import blocks (create deck + deck page import).
 *
 * Supported shapes:
 * - Repeated `Q:` / `A:` pairs (optional blank lines between cards)
 * - Optional `Card N` headings before each block; headings are not stored and
 *   mark a hard boundary so the next card label never appends to the prior answer.
 */

import { splitImportAnswerOnExampleMarker } from "@/lib/import-answer-split";

/** Whole line is only a structural "Card N" label (content not stored). */
const CARD_HEADING_LINE = /^\s*Card\s+\d+\s*:?\s*$/i;

export type ParsedQAPair = {
  question: string;
  answer_short: string;
  answer_example?: string;
};

export function parseQAPairs(text: string): ParsedQAPair[] | null {
  const lines = text.split(/\n/);
  const pairs: ParsedQAPair[] = [];
  let currentQ: string | null = null;
  let currentA: string[] = [];

  const flushPair = () => {
    if (currentQ !== null && currentA.length > 0) {
      const q = currentQ.trim();
      const a = currentA.join("\n").trim();
      if (q && a) {
        const { main, example } = splitImportAnswerOnExampleMarker(a);
        const row: ParsedQAPair = { question: q, answer_short: main };
        if (example) row.answer_example = example;
        pairs.push(row);
      }
    }
    currentQ = null;
    currentA = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (CARD_HEADING_LINE.test(trimmed)) {
      flushPair();
      continue;
    }

    const qMatch = line.match(/^Q:\s*(.*)$/i);
    const aMatch = line.match(/^A:\s*(.*)$/i);

    if (qMatch) {
      flushPair();
      currentQ = qMatch[1] ?? "";
    } else if (aMatch && currentQ !== null) {
      currentA.push(aMatch[1] ?? "");
    } else if (currentA.length > 0) {
      currentA.push(line);
    }
  }
  flushPair();

  return pairs.length >= 2 ? pairs : null;
}
