"use client";

import Latex from "react-latex-next";
import "katex/dist/katex.min.css";

type Props = {
  text: string;
  className?: string;
};

/** Remove \\ and \\newline from display-mode formulas (they have no effect and cause KaTeX warnings). */
function stripDisplayModeLineBreaks(text: string): string {
  if (!text.includes("$$")) return text;
  return text.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => {
    const cleaned = formula
      .replace(/\\\\/g, " ")
      .replace(/\\newline\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return `$$${cleaned}$$`;
  });
}

export default function FormattedText({ text, className }: Props) {
  if (!text) return null;

  const cleaned = stripDisplayModeLineBreaks(text);

  try {
    return (
      <div className={className ? `whitespace-pre-line ${className}` : "whitespace-pre-line"} dir="auto">
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
      <div className={className ? `whitespace-pre-line ${className}` : "whitespace-pre-line"} dir="auto">
        {cleaned}
      </div>
    );
  }
}
