"use client";

import { cn } from "@/lib/utils";
import type { GenerationLangPreference } from "@/lib/source-language";

type Props = {
  value: GenerationLangPreference;
  onChange: (v: GenerationLangPreference) => void;
  /** e.g. "Original" or "Original (Arabic)" */
  sourceLabel: string;
  disabled?: boolean;
  className?: string;
};

export function GenerationLanguageToggle({
  value,
  onChange,
  sourceLabel,
  disabled,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full rounded-md border border-border/60 bg-muted/20 p-0.5 text-xs",
        className,
      )}
      role="group"
      aria-label="Flashcard language"
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("source")}
        className={cn(
          "rounded px-2.5 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 max-mobile:min-h-9",
          value === "source"
            ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {sourceLabel}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("english")}
        className={cn(
          "rounded px-2.5 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 max-mobile:min-h-9",
          value === "english"
            ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        English
      </button>
    </div>
  );
}
