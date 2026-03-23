"use client";

import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

export interface FlashcardFlipProps {
  question: ReactNode;
  answer: ReactNode;
  className?: string;
  /** Controlled: flipped state from parent */
  flipped?: boolean;
  /** Controlled: called when user triggers flip */
  onFlip?: () => void;
}

/**
 * Reusable flashcard that shows question first and flips to answer on click.
 * Supports controlled mode (flipped + onFlip) for external triggers (e.g. Space key).
 * Resets to unflipped when the card changes (parent should use key={cardId}).
 */
export function FlashcardFlip({
  question,
  answer,
  className,
  flipped: controlledFlipped,
  onFlip,
}: FlashcardFlipProps) {
  const [internalFlipped, setInternalFlipped] = useState(false);
  const isControlled = controlledFlipped !== undefined;
  const flipped = isControlled ? controlledFlipped : internalFlipped;

  const toggle = () => {
    if (isControlled) {
      onFlip?.();
    } else {
      setInternalFlipped((f) => !f);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          toggle();
        }
      }}
      className={cn(
        "cursor-pointer select-none rounded-2xl border border-border bg-card shadow-md [perspective:1200px]",
        "transition-shadow hover:shadow-lg active:shadow-md",
        "min-h-[140px] w-full overflow-hidden",
        className
      )}
    >
      <div
        className="relative h-full w-full transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] [transform-style:preserve-3d]"
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        <div
          className="absolute inset-0 flex flex-col items-stretch justify-center p-5 [backface-visibility:hidden]"
          style={{ transform: "rotateY(0deg)" }}
        >
          <p className="text-base font-medium leading-relaxed text-foreground text-start">
            {question}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Click or press Space to reveal
          </p>
        </div>
        <div
          className="absolute inset-0 flex flex-col items-stretch justify-start overflow-y-auto p-5 [backface-visibility:hidden]"
          style={{ transform: "rotateY(180deg)" }}
        >
          <div className="text-base leading-relaxed text-foreground text-start">
            {answer}
          </div>
        </div>
      </div>
    </div>
  );
}
