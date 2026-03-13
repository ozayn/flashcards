"use client";

import { useState } from "react";

interface FlashcardProps {
  front: string;
  back: string;
  className?: string;
}

/**
 * Reusable flashcard with flip animation on hover.
 */
export function Flashcard({ front, back, className = "" }: FlashcardProps) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className={`flashcard cursor-pointer select-none [perspective:1200px] ${className}`}
      onMouseEnter={() => setFlipped(true)}
      onMouseLeave={() => setFlipped(false)}
    >
      <div
        className="flashcard-inner relative h-full w-full transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] [transform-style:preserve-3d]"
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        <div className="flashcard-front [backface-visibility:hidden] absolute inset-0 rounded-xl border border-border bg-card p-6 shadow-sm dark:bg-card">
          <p className="text-lg font-medium leading-relaxed text-foreground">
            {front}
          </p>
        </div>
        <div className="flashcard-back [backface-visibility:hidden] absolute inset-0 rounded-xl border border-border bg-card p-6 shadow-sm [transform:rotateY(180deg)] dark:bg-card">
          <p className="text-lg font-medium leading-relaxed text-foreground">
            {back}
          </p>
        </div>
      </div>
    </div>
  );
}
