"use client";

import type { ReactNode } from "react";
import { BlockMath, InlineMath } from "react-katex";
import { parseAnswerParagraphs } from "@/lib/format-flashcard-answer-display";
import { splitFencedCodeBlocks } from "@/lib/fenced-code";
import {
  parseInlineMarkdownTreeWithCode,
  type InlineMdNode,
} from "@/lib/inline-markdown";
import { FencedCodeBlock } from "@/components/fenced-code-block";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  className?: string;
  /**
   * Answer side only: insert a paragraph break before `Example:` / `Examples:` when needed.
   * Questions and other copy should use default.
   */
  variant?: "default" | "answer";
};

/** Repair common LLM LaTeX mistakes and JSON-escape corruption.
 * JSON parses \rho as \r+ho, \frac as \f+rac (backslash consumed). */
function repairLatex(math: string): string {
  return math
    .replace(/\rho/g, "\\rho")   // \r+ho -> \rho
    .replace(/\frac/g, "\\frac") // \f+rac -> \frac
    .replace(/\u03C1/g, "\\rho") // Unicode ρ -> \rho
    .replace(/\^Mightarrow/g, "\\Rightarrow")
    .replace(/\^Rightarrow/g, "\\Rightarrow")
    .replace(/\^rightarrow/g, "\\rightarrow")
    .replace(/\^Leftarrow/g, "\\Leftarrow")
    .replace(/\^leftarrow/g, "\\leftarrow");
}

function renderInlineMarkdownNodes(
  nodes: InlineMdNode[],
  keyPrefix: string
): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${keyPrefix}-${i}`;
    if (n.type === "text") {
      return <span key={k}>{n.value}</span>;
    }
    if (n.type === "italic") {
      return (
        <em key={k} className="italic">
          {n.value}
        </em>
      );
    }
    if (n.type === "code") {
      return (
        <code
          key={k}
          className="rounded-md border border-border/60 bg-muted/80 px-1.5 py-0.5 font-mono text-[0.88em] text-foreground [overflow-wrap:anywhere]"
        >
          {n.value}
        </code>
      );
    }
    if (n.type === "math") {
      const raw = n.value.trim();
      const math = repairLatex(raw);
      const fallback = `$${n.value}$`;
      return (
        <span key={k} className="katex-inline inline [overflow-wrap:anywhere]">
          <InlineMath
            math={math}
            errorColor="#888"
            strict={false}
            renderError={(err) => (
              <span className="text-destructive text-sm" title={err.message}>
                {fallback}
              </span>
            )}
          />
        </span>
      );
    }
    return (
      <strong key={k} className="font-semibold">
        {renderInlineMarkdownNodes(n.children, k)}
      </strong>
    );
  });
}

/** Render text with $$...$$ as block math, then **bold** / *italic* / `code` / $inline math$ on each segment. */
function renderMixed(text: string, keyPrefix: string) {
  const parts = text.split(/(\$\$[\s\S]*?\$\$)/);
  return parts.map((part, i) => {
    if (part.startsWith("$$")) {
      const raw = part.replace(/\$\$/g, "").trim();
      const math = repairLatex(raw);
      return (
        <span key={`${keyPrefix}-m${i}`} className="katex-block overflow-visible my-2">
          <BlockMath
            math={math}
            errorColor="#888"
            strict={false}
            renderError={() => (
              <InlineMath
                math={math}
                errorColor="#888"
                strict={false}
                renderError={(err) => (
                  <span className="text-destructive text-sm" title={err.message}>
                    {part}
                  </span>
                )}
              />
            )}
          />
        </span>
      );
    }
    const tree = parseInlineMarkdownTreeWithCode(part);
    return (
      <span key={`${keyPrefix}-t${i}`}>
        {renderInlineMarkdownNodes(tree, `${keyPrefix}-t${i}`)}
      </span>
    );
  });
}

function renderAnswerBlocksFromPlain(chunk: string, keyBase: string): ReactNode[] {
  const blocks = parseAnswerParagraphs(chunk);
  if (blocks.length === 0) return [];
  return blocks.map((block, i) =>
    block.type === "plain" ? (
      <div key={`${keyBase}-${i}`} className="min-w-0 whitespace-pre-line">
        {renderMixed(block.text, `${keyBase}-${i}`)}
      </div>
    ) : (
      <div key={`${keyBase}-${i}`} className="min-w-0 whitespace-pre-line">
        <span className="italic text-muted-foreground">{block.label}</span>
        {block.body ? (
          <>
            {" "}
            {renderMixed(block.body, `${keyBase}-${i}b`)}
          </>
        ) : null}
      </div>
    )
  );
}

export default function FormattedText({
  text,
  className,
  variant = "default",
}: Props) {
  if (!text) return null;

  const segments = splitFencedCodeBlocks(text);

  if (variant === "answer") {
    try {
      const children = segments.flatMap((seg, segIdx): ReactNode[] => {
        if (seg.kind === "fenced") {
          return [
            <FencedCodeBlock
              key={`f-${segIdx}`}
              body={seg.body}
              info={seg.info}
            />,
          ];
        }
        if (seg.value === "") return [];
        return renderAnswerBlocksFromPlain(seg.value, `a${segIdx}`);
      });
      if (children.length === 0) return null;
      return (
        <div className={cn("flex flex-col gap-y-4", className)} dir="auto">
          {children}
        </div>
      );
    } catch {
      return (
        <div className={cn("whitespace-pre-line", className)} dir="auto">
          {text}
        </div>
      );
    }
  }

  try {
    const children = segments.flatMap((seg, segIdx): ReactNode[] => {
      if (seg.kind === "fenced") {
        return [
          <FencedCodeBlock
            key={`qf-${segIdx}`}
            body={seg.body}
            info={seg.info}
          />,
        ];
      }
      if (seg.value === "") return [];
      return [
        <div
          key={`qt-${segIdx}`}
          className="min-w-0 whitespace-pre-line"
          dir="auto"
        >
          {renderMixed(seg.value, `q${segIdx}`)}
        </div>,
      ];
    });
    return (
      <div className={cn("flex flex-col gap-y-2", className)} dir="auto">
        {children}
      </div>
    );
  } catch {
    return (
      <div
        className={className ? `whitespace-pre-line ${className}` : "whitespace-pre-line"}
        dir="auto"
      >
        {text}
      </div>
    );
  }
}
