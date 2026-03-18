"use client";

import Latex from "react-latex-next";
import "katex/dist/katex.min.css";

type Props = {
  text: string;
  className?: string;
};

export default function FormattedText({ text, className }: Props) {
  if (!text) return null;

  try {
    return (
      <div className={className} dir="auto">
        <Latex
          delimiters={[
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
          ]}
        >
          {text}
        </Latex>
      </div>
    );
  } catch {
    return (
      <div className={className} dir="auto">
        {text}
      </div>
    );
  }
}
