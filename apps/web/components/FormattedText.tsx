"use client";

import Latex from "react-latex-next";
import "katex/dist/katex.min.css";

type Props = {
  text: string;
  className?: string;
};

/** Remove duplicate raw LaTeX before a $$ block. Replace LaTeX with empty string, keep surrounding text. */
function removeInlineLatexBeforeBlock(text: string): string {
  if (!text.includes("$$")) return text;

  const firstDd = text.indexOf("$$");
  const before = text.slice(0, firstDd);
  const after = text.slice(firstDd);

  // 1. Remove LaTeX expressions with empty string (don't truncate)
  const latexPattern = /\\[a-zA-Z]+(?:\{[^{}]*\})*/g;
  let cleanBefore = before.replace(latexPattern, "");

  // 2. Remove leftover math fragments (=, +, -, *, \cdot, and formula-like parentheses)
  cleanBefore = cleanBefore.replace(/\s*\\cdot\s*/g, " ");
  cleanBefore = cleanBefore.replace(/\s*[=+\-*]\s*/g, " ");
  cleanBefore = cleanBefore.replace(/\s*\([^)]*[=+\-_\\][^)]*\)\s*/g, " ");

  // 3. Collapse multiple spaces
  cleanBefore = cleanBefore.replace(/\s+/g, " ").trim();

  // 4. Ensure sentence ends cleanly (add period if needed)
  if (cleanBefore && !/[.!?]$/.test(cleanBefore)) {
    cleanBefore = cleanBefore.replace(/[\s,;]+$/, "") + ".";
  }

  const result = (cleanBefore + "\n\n" + after.trim()).trim();
  return result || text;
}

export default function FormattedText({ text, className }: Props) {
  if (!text) return null;

  const cleaned = removeInlineLatexBeforeBlock(text);

  try {
    return (
      <div className={className} dir="auto">
        <Latex
          delimiters={[
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
          ]}
        >
          {cleaned}
        </Latex>
      </div>
    );
  } catch {
    return (
      <div className={className} dir="auto">
        {cleaned}
      </div>
    );
  }
}
