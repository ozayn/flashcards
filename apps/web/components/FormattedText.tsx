"use client";

import { BlockMath, InlineMath } from "react-katex";
import { parseAnswerParagraphs } from "@/lib/format-flashcard-answer-display";
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

/** Render text with $$...$$ as block math. No modification of formula content - backslashes preserved. */
function renderMixed(text: string) {
  const parts = text.split(/(\$\$[\s\S]*?\$\$)/);
  return parts.map((part, i) => {
    if (part.startsWith("$$")) {
      const raw = part.replace(/\$\$/g, "").trim();
      const math = repairLatex(raw);
      return (
        <span key={i} className="katex-block overflow-visible my-2">
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
    return <span key={i}>{part}</span>;
  });
}

export default function FormattedText({
  text,
  className,
  variant = "default",
}: Props) {
  if (!text) return null;

  if (variant === "answer") {
    const blocks = parseAnswerParagraphs(text);
    if (blocks.length === 0) return null;
    try {
      return (
        <div
          className={cn("flex flex-col gap-y-4", className)}
          dir="auto"
        >
          {blocks.map((block, i) =>
            block.type === "plain" ? (
              <div key={i} className="min-w-0 whitespace-pre-line">
                {renderMixed(block.text)}
              </div>
            ) : (
              <div key={i} className="min-w-0 whitespace-pre-line">
                <span className="italic text-muted-foreground">{block.label}</span>
                {block.body ? (
                  <>
                    {" "}
                    {renderMixed(block.body)}
                  </>
                ) : null}
              </div>
            )
          )}
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
    return (
      <div
        className={className ? `whitespace-pre-line ${className}` : "whitespace-pre-line"}
        dir="auto"
      >
        {renderMixed(text)}
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
