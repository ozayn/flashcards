"use client";

import { ReactNode } from "react";

export interface FlashcardProps {
  front: ReactNode;
  back: ReactNode;
  flipped: boolean;
  onFlip: () => void;
  canFlip: boolean;
}

export function Flashcard({ front, back, flipped, onFlip, canFlip }: FlashcardProps) {
  return (
    <div
      onClick={() => canFlip && onFlip()}
      className={`flashcard-inner w-full h-full relative ${canFlip ? "cursor-pointer" : "cursor-wait"} ${flipped ? "flipped" : ""}`}
      style={{ transformStyle: "preserve-3d" }}
    >
      {/* Front face */}
      <div
        className="flashcard-face absolute inset-0 w-full h-full rounded-2xl bg-card border border-border shadow-lg shadow-black/10 flex flex-col items-stretch justify-center p-4 md:p-8"
        style={{ backfaceVisibility: "hidden" }}
      >
        {front}
      </div>

      {/* Back face */}
      <div
        className="flashcard-face flashcard-back absolute inset-0 w-full h-full rounded-2xl bg-card border border-border shadow-lg shadow-black/10 flex flex-col items-stretch px-3 md:px-4 pt-3 pb-2 text-center"
        style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
      >
        {back}
      </div>
    </div>
  );
}
