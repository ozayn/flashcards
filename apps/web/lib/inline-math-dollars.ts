/**
 * Conservative single-dollar inline math delimiters ($...$).
 * Block math ($$...$$) is handled in FormattedText before this runs.
 * Fenced / inline code should be stripped before running on a slice.
 */

export type DollarMathSegment = { type: "text"; value: string } | { type: "math"; value: string };

/** Index of closing `$`, or -1 if unclosed / newline before any closing `$`. */
function findClosingDollar(text: string, from: number): number {
  let j = from;
  const n = text.length;
  while (j < n) {
    const c = text[j];
    if (c === "\n" || c === "\r") return -1;
    if (c === "\\" && j + 1 < n) {
      j += 2;
      continue;
    }
    if (c === "$") return j;
    j += 1;
  }
  return -1;
}

function isAcceptableInlineMathInner(inner: string): boolean {
  const t = inner.trim();
  if (t.length === 0) return false;
  if (/^[0-9]+$/.test(t)) return false;
  return true;
}

/**
 * Split plain text into literal runs and inline math spans.
 * `$$` is kept as literal (two dollar signs). Malformed `$` pairs stay literal.
 */
export function splitInlineDollarMath(text: string): DollarMathSegment[] {
  const out: DollarMathSegment[] = [];
  let buf = "";
  let i = 0;
  const n = text.length;

  const flushBuf = () => {
    if (buf.length > 0) {
      out.push({ type: "text", value: buf });
      buf = "";
    }
  };

  while (i < n) {
    const c = text[i];
    if (c !== "$") {
      buf += c;
      i += 1;
      continue;
    }
    if (i + 1 < n && text[i + 1] === "$") {
      buf += "$$";
      i += 2;
      continue;
    }
    const close = findClosingDollar(text, i + 1);
    if (close === -1) {
      buf += "$";
      i += 1;
      continue;
    }
    const inner = text.slice(i + 1, close);
    if (!isAcceptableInlineMathInner(inner)) {
      buf += text.slice(i, close + 1);
      i = close + 1;
      continue;
    }
    flushBuf();
    out.push({ type: "math", value: inner });
    i = close + 1;
  }
  flushBuf();
  return out;
}
