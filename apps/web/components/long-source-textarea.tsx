"use client";

import type { ReactNode } from "react";

const textareaClass =
  "w-full min-h-[min(42vh,15rem)] max-h-[min(72vh,38rem)] resize-y overflow-y-auto rounded-md border border-input bg-background px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 max-mobile:min-h-[min(38vh,13rem)]";

type LongSourceTextareaProps = {
  id: string;
  name?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength: number;
  /** e.g. file upload + status (left side of bottom row) */
  auxiliaryRow?: ReactNode;
  className?: string;
};

/**
 * Text / transcript input tuned for long pasted content: taller default, vertical resize,
 * max height with internal scroll, line breaks preserved (whitespace-pre-wrap).
 */
export function LongSourceTextarea({
  id,
  name,
  value,
  onChange,
  placeholder,
  disabled,
  maxLength,
  auxiliaryRow,
  className,
}: LongSourceTextareaProps) {
  const len = value.length;
  const atLimit = len >= maxLength;

  return (
    <div className={className}>
      <textarea
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        spellCheck={false}
        autoComplete="off"
        className={textareaClass}
      />
      <div className="mt-2 space-y-1.5">
        <p className="text-[11px] sm:text-xs text-muted-foreground/75 leading-snug">
          Long text is okay. Very long sources may be processed in chunks.
        </p>
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5">
          {auxiliaryRow ? <div className="min-w-0 flex-1">{auxiliaryRow}</div> : <span />}
          <span
            className="shrink-0 text-[11px] sm:text-xs text-muted-foreground/70 tabular-nums"
            aria-live="polite"
          >
            {len.toLocaleString()} / {maxLength.toLocaleString()}
            {atLimit ? (
              <span className="ml-1 text-destructive/90" aria-hidden>
                · limit
              </span>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}
