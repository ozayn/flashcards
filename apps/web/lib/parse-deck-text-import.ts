/**
 * Unified import: strict `Q:` / `A:` blocks (see parseQAPairs) and our deck .txt export format
 * (title, metadata, divider lines, numbered questions).
 */

import { splitImportAnswerOnExampleMarker } from "@/lib/import-answer-split";
import { type ParsedQAPair, parseQAPairs } from "@/lib/parse-qa-pairs";

export type DeckTextImportMetadata = {
  title?: string;
  category?: string;
  source?: string;
  sourceUrl?: string;
  topic?: string;
  /** Value from a `Cards: N` line, if present */
  cardsCountLine?: number;
};

export type DeckTextImportResult =
  | {
      ok: true;
      format: "strict" | "export";
      pairs: ParsedQAPair[];
      metadata?: DeckTextImportMetadata;
    }
  | { ok: false; error: string };

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function hasDividerLine(t: string): boolean {
  return /^\s*[-]{3,}\s*$/m.test(t);
}

function hasNumberedItemLine(t: string): boolean {
  return /^\s*\d+\.\s+\S/m.test(t);
}

function hasCardsCountLine(t: string): boolean {
  return /^\s*Cards:\s*\d+\s*$/m.test(t);
}

/**
 * Heuristic: export uses dashed separators and `N. ` question lines, often with
 * a `Category:` / `Source:` / `Cards:` header.
 */
export function looksLikeExportFormat(text: string): boolean {
  const t = normalizeNewlines(text);
  if (!t.trim()) return false;
  if (hasNumberedItemLine(t) && hasDividerLine(t)) return true;
  if (hasCardsCountLine(t) && hasNumberedItemLine(t) && hasDividerLine(t)) return true;
  return false;
}

const META_LINE = {
  category: /^\s*Category:\s*(.*)$/i,
  source: /^\s*Source:\s*(.*)$/i,
  sourceUrl: /^\s*Source URL:\s*(.*)$/i,
  topic: /^\s*Topic:\s*(.*)$/i,
  cards: /^\s*Cards:\s*(\d+)\s*$/i,
} as const;

function parseHeaderSection(raw: string): DeckTextImportMetadata {
  const metadata: DeckTextImportMetadata = {};
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let m = META_LINE.category.exec(line);
    if (m) {
      const v = (m[1] ?? "").trim();
      if (v) metadata.category = v;
      continue;
    }
    m = META_LINE.source.exec(line);
    if (m) {
      const v = (m[1] ?? "").trim();
      if (v) metadata.source = v;
      continue;
    }
    m = META_LINE.sourceUrl.exec(line);
    if (m) {
      const v = (m[1] ?? "").trim();
      if (v) metadata.sourceUrl = v;
      continue;
    }
    m = META_LINE.topic.exec(line);
    if (m) {
      const v = (m[1] ?? "").trim();
      if (v) metadata.topic = v;
      continue;
    }
    m = META_LINE.cards.exec(line);
    if (m) {
      const n = parseInt(m[1] ?? "", 10);
      if (Number.isFinite(n)) metadata.cardsCountLine = n;
      continue;
    }
    if (metadata.title === undefined && !/^\d+\./.test(line.trim())) {
      const t = line.replace(/^["']|["']$/g, "").trim();
      if (t) metadata.title = t;
    }
  }
  return metadata;
}

const NUMBERED_Q = /^\s*(\d+)\.\s+(.*)$/;

function parseCardQuestionLine(firstLine: string): { question: string } | null {
  const m = firstLine.match(NUMBERED_Q);
  if (!m) return null;
  return { question: (m[2] ?? "").trim() || (m[1] ?? "") };
}

function parseCardAnswerBody(body: string): {
  answer_short: string;
  answer_example?: string;
  answer_detailed?: string;
} {
  let t = normalizeNewlines(body);
  let detailed: string | undefined;
  const md = t.match(/(?:\n\n|\n)More detail:\s*\n([\s\S]+)$/i);
  if (md && md.index !== undefined) {
    detailed = (md[1] ?? "").trim() || undefined;
    t = t.slice(0, md.index).trim();
  } else {
    t = t.trim();
  }

  if (t === "" || t === "(empty definition)") {
    return { answer_short: "—", answer_detailed: detailed };
  }

  if (/^Definition:\s*\n/i.test(t)) {
    t = t.replace(/^Definition:\s*\n/i, "").trim();
    const exSplit = t.split(/\n\nExample:\s*\n/i);
    if (exSplit.length >= 2) {
      return {
        answer_short: (exSplit[0] ?? "").trim() || "—",
        answer_example: (exSplit.slice(1).join("\n\nExample:\n") ?? "").trim() || undefined,
        answer_detailed: detailed,
      };
    }
    const ex2 = t.split(/\nExample:\s*\n/i);
    if (ex2.length >= 2) {
      return {
        answer_short: (ex2[0] ?? "").trim() || "—",
        answer_example: (ex2.slice(1).join("\n") ?? "").trim() || undefined,
        answer_detailed: detailed,
      };
    }
    return { answer_short: t.trim() || "—", answer_detailed: detailed };
  }

  if (t.includes("Example:")) {
    const parts = t.split(/\n\nExample:\s*\n/i);
    if (parts.length >= 2) {
      let main = (parts[0] ?? "").trim();
      if (main === "(empty definition)") main = "—";
      return {
        answer_short: main || "—",
        answer_example: (parts[1] ?? "").trim() || undefined,
        answer_detailed: detailed,
      };
    }
  }

  const { main, example } = splitImportAnswerOnExampleMarker(t);
  return {
    answer_short: (main || "—").trim() || "—",
    answer_example: example || undefined,
    answer_detailed: detailed,
  };
}

function splitByDivider(text: string): string[] {
  const n = normalizeNewlines(text);
  return n
    .split(/^\s*[-]{3,}\s*$/m)
    .map((p) => p.replace(/^\n+|\n+$/g, ""))
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Parse our .txt export shape (see `exportDeckAsTxt` in deck page).
 * Returns { pairs, metadata } or empty pairs with a reason the caller can surface.
 */
export function parseExportFormat(text: string): {
  pairs: ParsedQAPair[];
  metadata: DeckTextImportMetadata;
  error?: string;
} {
  const t = normalizeNewlines(text).trim();
  if (!t) {
    return { pairs: [], metadata: {}, error: "Empty file." };
  }
  if (!hasDividerLine(t) || !hasNumberedItemLine(t)) {
    return {
      pairs: [],
      metadata: {},
      error: "Export-style text needs dashed lines (---) and lines starting with 1. 2. … for questions.",
    };
  }

  const chunks = splitByDivider(t);
  if (chunks.length === 0) {
    return { pairs: [], metadata: {}, error: "No content between divider lines." };
  }

  const firstLineOf = (ch: string) => ch.split("\n").find((l) => l.trim().length > 0) ?? "";
  const isCardChunk = (ch: string) => {
    return parseCardQuestionLine(firstLineOf(ch)) !== null;
  };

  const firstCardIndex = chunks.findIndex((c) => isCardChunk(c));
  if (firstCardIndex < 0) {
    return {
      pairs: [],
      metadata: parseHeaderSection(chunks[0] ?? ""),
      error: "No numbered questions (1. 2. …) found in this file.",
    };
  }

  const headerRaw = firstCardIndex > 0 ? chunks.slice(0, firstCardIndex).join("\n\n") : "";
  const metadata = headerRaw ? parseHeaderSection(headerRaw) : {};
  const cardChunks = chunks.slice(firstCardIndex);

  const pairs: ParsedQAPair[] = [];
  for (const block of cardChunks) {
    if (!isCardChunk(block)) continue;
    const lines = block.split("\n");
    const firstIdx = lines.findIndex((l) => l.trim().length > 0);
    if (firstIdx < 0) continue;
    const firstLine = lines[firstIdx] ?? "";
    const qParsed = parseCardQuestionLine(firstLine);
    if (!qParsed) continue;
    if (!qParsed.question) {
      return {
        pairs: [],
        metadata,
        error: "A numbered card is missing the question text.",
      };
    }
    const body = lines.slice(firstIdx + 1).join("\n").trim();
    const a = parseCardAnswerBody(body);
    if (!a.answer_short || !a.answer_short.trim()) {
      return {
        pairs: [],
        metadata,
        error: "A card is missing a usable answer after parsing.",
      };
    }
    const row: ParsedQAPair = {
      question: qParsed.question,
      answer_short: a.answer_short,
    };
    if (a.answer_example) row.answer_example = a.answer_example;
    if (a.answer_detailed) row.answer_detailed = a.answer_detailed;
    pairs.push(row);
  }

  if (pairs.length === 0) {
    return {
      pairs: [],
      metadata,
      error: "Could not read any card blocks. Each block should start with 1. … 2. … under dashed lines.",
    };
  }

  return { pairs, metadata };
}

/**
 * Tries our export re-import first when the heuristics say so, then standard Q:/A:.
 * Does not use export heuristics when they match but no cards—returns an error instead of
 * mis-parsing.
 */
export function parseDeckTextImport(text: string): DeckTextImportResult {
  const t = text.trim();
  if (!t) {
    return { ok: false, error: "No text to import." };
  }

  const exportish = looksLikeExportFormat(t);
  if (exportish) {
    const { pairs, metadata, error } = parseExportFormat(t);
    if (pairs.length > 0) {
      return { ok: true, format: "export", pairs, metadata };
    }
    return {
      ok: false,
      error:
        error ??
        "The text looks like a deck export (dashes and numbered items) but we could not parse any cards. Check dividers and `1. Question` lines.",
    };
  }

  const strict = parseQAPairs(t);
  if (strict && strict.length > 0) {
    return { ok: true, format: "strict", pairs: strict };
  }

  return {
    ok: false,
    error:
      "This doesn't look like a deck export (use dashed lines and 1. 2. … for questions) or a Q: / A: list. For simple import, use lines starting with Q: and A: for each card.",
  };
}
