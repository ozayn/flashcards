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
 * Uses same proportions as study mode (aspect-[3/2], max-w-2xl) and shared flashcard CSS.
 * Supports controlled mode (flipped + onFlip) for external triggers (e.g. Space key).
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
        "flashcard relative w-full max-w-2xl aspect-[3/2] overflow-hidden rounded-2xl",
        "border border-neutral-200 shadow-lg flashcard-paper dark:border-neutral-700",
        "cursor-pointer select-none transition-shadow hover:shadow-xl active:shadow-md",
        className
      )}
    >
      <div
        className={cn(
          "flashcard-inner absolute inset-0 w-full h-full",
          flipped && "flipped"
        )}
      >
        {/* Front face - question */}
        <div className="flashcard-face flashcard-front absolute inset-0 w-full h-full flex flex-col items-stretch justify-start p-6 md:p-10 text-start rounded-2xl border border-neutral-200 shadow-lg flashcard-paper dark:border-neutral-700">
          <div className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden">
            {question}
          </div>
        </div>

        {/* Back face - answer */}
        <div className="flashcard-face flashcard-back absolute inset-0 w-full h-full flex flex-col items-stretch justify-start px-6 md:px-10 pt-6 pb-4 text-start rounded-2xl border border-neutral-200 shadow-lg flashcard-paper dark:border-neutral-700">
          <div className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden">
            {answer}
          </div>
        </div>
      </div>
    </div>
  );
}
