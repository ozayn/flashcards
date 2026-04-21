/**
 * Lightweight **bold** and *italic* for flashcard text (display + tests).
 * Block math ($$...$$) is split out before this runs; inline $...$ is parsed here after code (see FormattedText).
 */

import { splitInlineDollarMath } from "@/lib/inline-math-dollars";

export type InlineMdNode =
  | { type: "text"; value: string }
  | { type: "italic"; value: string }
  | { type: "bold"; children: InlineMdNode[] }
  | { type: "code"; value: string }
  | { type: "math"; value: string };

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

/** Split `...` inline code (single backticks, no newlines inside span). */
export function splitInlineCode(
  text: string
): { type: "text" | "inlineCode"; value: string }[] {
  const out: { type: "text" | "inlineCode"; value: string }[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const tick = text.indexOf("`", i);
    if (tick === -1) {
      if (i < n) out.push({ type: "text", value: text.slice(i) });
      break;
    }
    if (tick + 2 < n && text[tick + 1] === "`" && text[tick + 2] === "`") {
      out.push({ type: "text", value: text.slice(i, tick + 3) });
      i = tick + 3;
      continue;
    }
    if (tick > i) out.push({ type: "text", value: text.slice(i, tick) });
    const end = text.indexOf("`", tick + 1);
    if (end === -1) {
      out.push({ type: "text", value: text.slice(tick) });
      break;
    }
    if (end === tick + 1) {
      out.push({ type: "text", value: "`" });
      i = tick + 1;
      continue;
    }
    const inner = text.slice(tick + 1, end);
    if (inner.includes("\n") || inner.includes("\r")) {
      out.push({ type: "text", value: text.slice(tick, end + 1) });
      i = end + 1;
      continue;
    }
    out.push({ type: "inlineCode", value: inner });
    i = end + 1;
  }
  return out;
}

function parseDollarMathAndItalicInText(text: string): InlineMdNode[] {
  const nodes: InlineMdNode[] = [];
  for (const seg of splitInlineDollarMath(text)) {
    if (seg.type === "math") {
      nodes.push({ type: "math", value: seg.value });
    } else {
      nodes.push(...segmentsToItalicNodes(parseItalicSegments(seg.value)));
    }
  }
  return nodes;
}

function parseItalicCodeAndMathInText(text: string): InlineMdNode[] {
  const nodes: InlineMdNode[] = [];
  for (const seg of splitInlineCode(text)) {
    if (seg.type === "inlineCode") {
      nodes.push({ type: "code", value: seg.value });
    } else {
      nodes.push(...parseDollarMathAndItalicInText(seg.value));
    }
  }
  return nodes;
}

/**
 * **bold** / *italic* / `inline code` / $inline math$.
 * Order per slice: fenced code is removed earlier; here backticks, then $...$, then *...*.
 */
export function parseInlineMarkdownTreeWithCode(text: string): InlineMdNode[] {
  const nodes: InlineMdNode[] = [];
  for (const part of parseBoldSegments(text)) {
    if (part.type === "bold") {
      nodes.push({
        type: "bold",
        children: parseItalicCodeAndMathInText(part.value),
      });
    } else {
      nodes.push(...parseItalicCodeAndMathInText(part.value));
    }
  }
  return nodes;
}
