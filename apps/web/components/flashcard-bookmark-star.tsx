"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  bookmarked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  /** Smaller hit target for dense rows */
  compact?: boolean;
};

export function FlashcardBookmarkStar({
  bookmarked,
  onToggle,
  disabled,
  busy,
  className,
  compact,
}: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled && !busy) onToggle();
      }}
      disabled={disabled || busy}
      className={cn(
        "shrink-0 rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40",
        bookmarked && "text-amber-500 hover:text-amber-600",
        compact ? "p-1" : "p-1.5",
        className
      )}
      aria-label={bookmarked ? "Remove from saved" : "Save card for later"}
      aria-pressed={bookmarked}
    >
      <Star
        className={cn(
          compact ? "size-4" : "size-[1.125rem]",
          bookmarked ? "fill-current" : "fill-none"
        )}
      />
    </button>
  );
}
