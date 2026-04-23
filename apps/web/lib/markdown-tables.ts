/**
 * GFM-style pipe tables for flashcard display (not a full CommonMark engine).
 * Malformed structures do not throw; the caller can fall back to plain text.
 */

export type GfmTableTextSegment = { kind: "text"; value: string };
export type GfmTableTableSegment = {
  kind: "table";
  header: string[];
  body: string[][];
};

export type GfmTableSegment = GfmTableTextSegment | GfmTableTableSegment;

/** GFM table delimiter: only dashes, colons, optional pipes, whitespace. */
export function isDelimiterRow(line: string): boolean {
  const t = line.trim();
  if (!t || !t.includes("-") || !t.includes("|")) return false;
  const noSpace = t.replace(/\s/g, "");
  if (!/^[|:\-]+$/.test(noSpace)) return false;
  // Each cell must be at least 3 hyphens (GFM)
  const cells = splitPipeCells(t);
  if (cells.length === 0) return false;
  return cells.every((c) => {
    const s = c.replace(/\s/g, "");
    return /^:?-{3,}:?$/.test(s);
  });
}

export function hasPipeTableShape(line: string): boolean {
  return line.includes("|");
}

/**
 * Row cells: leading/trailing | optional; split on | and trim.
 */
export function parseTableRow(line: string): string[] {
  let s = line.trim();
  if (!s) return [];
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function splitPipeCells(line: string): string[] {
  return parseTableRow(line);
}

/**
 * @returns `null` if this is not a well-formed GFM table starting at `startLine`.
 * Does not require body rows; header + delimiter is enough.
 */
export function tryParseGfmTableAt(
  lines: string[],
  startLine: number
): { endLine: number; header: string[]; body: string[][] } | null {
  if (startLine + 1 >= lines.length) return null;
  const headerLine = lines[startLine] ?? "";
  const sepLine = lines[startLine + 1] ?? "";
  if (!hasPipeTableShape(headerLine) || !isDelimiterRow(sepLine)) return null;
  const header = parseTableRow(headerLine);
  if (header.length === 0) return null;
  const sepCells = parseTableRow(sepLine);
  if (sepCells.length !== header.length) return null;
  const n = header.length;
  const body: string[][] = [];
  let j = startLine + 2;
  while (j < lines.length) {
    const L = lines[j] ?? "";
    if (L.trim() === "") break;
    if (isDelimiterRow(L)) break;
    if (!hasPipeTableShape(L)) break;
    const row = parseTableRow(L);
    if (row.length === 0) break;
    body.push(padOrTrimRow(row, n));
    j += 1;
  }
  return { endLine: j, header, body };
}

function padOrTrimRow(row: string[], len: number): string[] {
  if (row.length === len) return row;
  if (row.length > len) return row.slice(0, len);
  return [...row, ...Array(len - row.length).fill("")];
}

/**
 * Splits `text` into text chunks and GFM table chunks. Fails open: on internal error, returns
 * a single text segment equal to the original string.
 */
export function splitTextAndGfmTables(text: string): GfmTableSegment[] {
  if (!text) return [];
  try {
    return splitTextAndGfmTablesImpl(text);
  } catch {
    return [{ kind: "text", value: text }];
  }
}

function splitTextAndGfmTablesImpl(text: string): GfmTableSegment[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const out: GfmTableSegment[] = [];
  let lineBuf: string[] = [];
  const flushText = () => {
    if (lineBuf.length === 0) return;
    out.push({ kind: "text", value: lineBuf.join("\n") });
    lineBuf = [];
  };

  let i = 0;
  const n = lines.length;
  while (i < n) {
    const parsed = tryParseGfmTableAt(lines, i);
    if (parsed) {
      const { endLine, header, body } = parsed;
      flushText();
      out.push({ kind: "table", header, body });
      i = endLine;
      continue;
    }
    lineBuf.push(lines[i] ?? "");
    i += 1;
  }
  flushText();
  return out;
}
