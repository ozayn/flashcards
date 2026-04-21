"use client";

import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  wrapFencedCodeBlockSelection,
  wrapFieldSelection,
} from "@/lib/wrap-field-selection";

type Props = {
  inputRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
};

export function FlashcardMarkdownToolbar({ inputRef, value, onChange }: Props) {
  const apply = (open: string, close: string) => {
    const el = inputRef.current;
    if (!el) return;
    wrapFieldSelection(el, value, onChange, open, close);
  };

  const applyFencedBlock = () => {
    const el = inputRef.current;
    if (!el) return;
    wrapFencedCodeBlockSelection(el, value, onChange);
  };

  return (
    <div
      className="flex items-center gap-0.5"
      role="toolbar"
      aria-label="Text formatting"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 min-w-8 shrink-0 px-0 font-bold"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => apply("**", "**")}
        aria-label="Bold"
        title="Bold (**text**)"
      >
        B
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 min-w-8 shrink-0 px-0 italic"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => apply("*", "*")}
        aria-label="Italic"
        title="Italic (*text*)"
      >
        I
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 min-w-8 shrink-0 px-0 font-mono text-sm font-semibold"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => apply("`", "`")}
        aria-label="Inline code with backticks"
        title="Inline code (`text`)"
      >
        {"`"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 min-w-[2.25rem] shrink-0 px-0.5 font-mono text-[10px] leading-none tracking-tighter"
        onMouseDown={(e) => e.preventDefault()}
        onClick={applyFencedBlock}
        aria-label="Fenced code block with backticks"
        title="Code block (triple backticks, opening and closing on separate lines)"
      >
        {"```"}
      </Button>
    </div>
  );
}
