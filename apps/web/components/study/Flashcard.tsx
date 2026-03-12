"use client";

import { ReactNode } from "react";

const faceBase = "flashcard-face absolute inset-0 w-full h-full flex flex-col items-stretch";

const styleMap = {
  paper: "rounded-2xl border border-neutral-200 shadow-lg flashcard-paper dark:border-neutral-700",
  minimal: "rounded-xl bg-white border border-neutral-200 shadow-sm dark:bg-neutral-900 dark:border-neutral-700",
  modern: "rounded-2xl flashcard-modern dark:border-neutral-700",
  anki: "rounded-lg flashcard-anki",
} as const;

export interface FlashcardProps {
  front: ReactNode;
  back: ReactNode;
  flipped: boolean;
  onFlip: () => void;
  canFlip: boolean;
  cardStyle?: "paper" | "minimal" | "modern" | "anki";
}

export function Flashcard({ front, back, flipped, onFlip, canFlip, cardStyle = "paper" }: FlashcardProps) {
  const faceClass = styleMap[cardStyle] ?? styleMap.paper;
  return (
    <div
      onClick={() => canFlip && onFlip()}
      className={`flashcard-inner w-full h-full relative ${canFlip ? "cursor-pointer" : "cursor-wait"} ${flipped ? "flipped" : ""}`}
      style={{ transformStyle: "preserve-3d" }}
    >
      {/* Front face */}
      <div
        className={`${faceBase} justify-start items-center text-center p-4 md:p-8 ${faceClass}`}
        style={{ backfaceVisibility: "hidden" }}
      >
        {front}
      </div>

      {/* Back face */}
      <div
        className={`${faceBase} flashcard-back px-3 md:px-4 pt-3 pb-2 text-center ${faceClass}`}
        style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
      >
        {back}
      </div>
    </div>
  );
}
