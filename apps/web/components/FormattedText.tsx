"use client";

import { BlockMath } from "react-katex";

type Props = {
  text: string;
  className?: string;
};

/** Render text with $$...$$ as block math. No modification of formula content - backslashes preserved. */
function renderMixed(text: string) {
  const parts = text.split(/(\$\$[\s\S]*?\$\$)/);
  return parts.map((part, i) => {
    if (part.startsWith("$$")) {
      const math = part.replace(/\$\$/g, "").trim();
      return (
        <span key={i} className="katex-block overflow-visible my-2">
          <BlockMath
            math={math}
            renderError={(err) => (
              <span className="text-destructive text-sm" title={err.message}>
                {part}
              </span>
            )}
          />
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function FormattedText({ text, className }: Props) {
  if (!text) return null;

  console.log("RENDER INPUT:", text);

  try {
    return (
      <div className={className ? `whitespace-pre-line ${className}` : "whitespace-pre-line"} dir="auto">
        {renderMixed(text)}
      </div>
    );
  } catch {
    return (
      <div className={className ? `whitespace-pre-line ${className}` : "whitespace-pre-line"} dir="auto">
        {text}
      </div>
    );
  }
}
