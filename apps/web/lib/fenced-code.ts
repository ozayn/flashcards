/**
 * Extract GitHub-style fenced code blocks (``` ... ```) from flashcard text.
 * Malformed / unclosed fences fall back to plain text (no throw).
 */

export type FencedSegment =
  | { kind: "text"; value: string }
  | { kind: "fenced"; body: string; info?: string };

/** Find start index of closing fence line (line that is only ``` optional trailing ws). */
function _closingFenceLineStart(text: string, from: number): number {
  let pos = from;
  const n = text.length;
  while (pos < n) {
    const nl = text.indexOf("\n", pos);
    const lineEnd = nl === -1 ? n : nl;
    const line = text.slice(pos, lineEnd);
    if (/^```\s*$/.test(line)) {
      return pos;
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  return -1;
}

/**
 * Split `text` into alternating plain segments and fenced code bodies.
 * Opening fence: ``` optional-info newline body closing ``` on its own line.
 */
export function splitFencedCodeBlocks(text: string): FencedSegment[] {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, "\n");
  const out: FencedSegment[] = [];
  let i = 0;
  const n = normalized.length;

  while (i < n) {
    const open = normalized.indexOf("```", i);
    if (open === -1) {
      if (i < n) out.push({ kind: "text", value: normalized.slice(i) });
      break;
    }
    if (open > i) {
      out.push({ kind: "text", value: normalized.slice(i, open) });
    }
    const afterTicks = open + 3;
    const lineEnd = normalized.indexOf("\n", afterTicks);
    if (lineEnd === -1) {
      out.push({ kind: "text", value: normalized.slice(open) });
      break;
    }
    const infoLine = normalized.slice(afterTicks, lineEnd).trim();
    const info = infoLine.length > 0 ? infoLine : undefined;
    const bodyStart = lineEnd + 1;
    const closeLine = _closingFenceLineStart(normalized, bodyStart);
    if (closeLine === -1) {
      out.push({ kind: "text", value: normalized.slice(open) });
      break;
    }
    let bodyEnd = closeLine;
    while (bodyEnd > bodyStart && normalized[bodyEnd - 1] === "\n") {
      bodyEnd -= 1;
    }
    const body = normalized.slice(bodyStart, bodyEnd);
    out.push({ kind: "fenced", body, info });
    const afterClose = normalized.indexOf("\n", closeLine);
    i = afterClose === -1 ? n : afterClose + 1;
  }

  return out;
}
