/**
 * Lightweight **bold** and *italic* for flashcard text (display + tests).
 * Block math is split out before this runs (see FormattedText).
 */

export type InlineMdNode =
  | { type: "text"; value: string }
  | { type: "italic"; value: string }
  | { type: "bold"; children: InlineMdNode[] };

/** Split on **...** pairs; unclosed ** is left as literal text. */
export function parseBoldSegments(text: string): { type: "text" | "bold"; value: string }[] {
  const out: { type: "text" | "bold"; value: string }[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const j = text.indexOf("**", i);
    if (j === -1) {
      if (i < n) out.push({ type: "text", value: text.slice(i) });
      break;
    }
    if (j > i) out.push({ type: "text", value: text.slice(i, j) });
    const k = text.indexOf("**", j + 2);
    if (k === -1) {
      out.push({ type: "text", value: text.slice(j) });
      break;
    }
    out.push({ type: "bold", value: text.slice(j + 2, k) });
    i = k + 2;
  }
  return out;
}

/**
 * Split on single *...* pairs. Literal `**` is preserved as text.
 */
export function parseItalicSegments(text: string): { type: "text" | "italic"; value: string }[] {
  const out: { type: "text" | "italic"; value: string }[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const j = text.indexOf("*", i);
    if (j === -1) {
      if (i < n) out.push({ type: "text", value: text.slice(i) });
      break;
    }
    if (j > i) out.push({ type: "text", value: text.slice(i, j) });
    if (text[j + 1] === "*") {
      out.push({ type: "text", value: "**" });
      i = j + 2;
      continue;
    }
    const k = text.indexOf("*", j + 1);
    if (k === -1) {
      out.push({ type: "text", value: text.slice(j) });
      break;
    }
    if (k === j + 1) {
      out.push({ type: "text", value: "*" });
      i = j + 1;
      continue;
    }
    out.push({ type: "italic", value: text.slice(j + 1, k) });
    i = k + 1;
  }
  return out;
}

function segmentsToItalicNodes(
  segments: { type: "text" | "italic"; value: string }[]
): InlineMdNode[] {
  return segments.map((s) =>
    s.type === "italic" ? { type: "italic" as const, value: s.value } : { type: "text" as const, value: s.value }
  );
}

/**
 * Parse full inline markdown: bold wraps italic-capable children (*...* inside **...** works).
 */
export function parseInlineMarkdownTree(text: string): InlineMdNode[] {
  const nodes: InlineMdNode[] = [];
  for (const part of parseBoldSegments(text)) {
    if (part.type === "bold") {
      nodes.push({
        type: "bold",
        children: segmentsToItalicNodes(parseItalicSegments(part.value)),
      });
    } else {
      nodes.push(...segmentsToItalicNodes(parseItalicSegments(part.value)));
    }
  }
  return nodes;
}
