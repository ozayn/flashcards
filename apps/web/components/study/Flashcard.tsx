"use client";

import { ReactNode } from "react";

const faceBase = "flashcard-face flashcard-front absolute inset-0 w-full h-full flex flex-col items-stretch";

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
  /** Extra inline-end + block-start inset so a corner bookmark does not cover text (use with dir=auto). */
  reserveBookmarkCorner?: boolean;
}

const _padDefaultFront =
  "p-6 md:p-10 lg:p-12 landscape-mobile:p-2 landscape-mobile:pt-1.5";
const _padReserveFront =
  "ps-6 pe-12 pt-8 pb-6 md:ps-10 md:pe-14 md:pt-10 md:pb-10 lg:ps-12 lg:pe-16 lg:pt-12 lg:pb-12 landscape-mobile:ps-2 landscape-mobile:pe-10 landscape-mobile:pt-4 landscape-mobile:pb-2";
const _padDefaultBack =
  "px-6 md:px-10 lg:px-12 pt-6 pb-4 landscape-mobile:px-2 landscape-mobile:pt-1.5 landscape-mobile:pb-1.5";
const _padReserveBack =
  "ps-6 pe-12 pt-8 pb-4 md:ps-10 md:pe-14 md:pt-10 md:pb-4 lg:ps-12 lg:pe-16 lg:pt-12 lg:pb-4 landscape-mobile:ps-2 landscape-mobile:pe-10 landscape-mobile:pt-4 landscape-mobile:pb-1.5";

export function Flashcard({
  front,
  back,
  flipped,
  onFlip,
  canFlip,
  cardStyle = "paper",
  reserveBookmarkCorner = false,
}: FlashcardProps) {
  const faceClass = styleMap[cardStyle] ?? styleMap.paper;
  const frontPad = reserveBookmarkCorner ? _padReserveFront : _padDefaultFront;
  const backPad = reserveBookmarkCorner ? _padReserveBack : _padDefaultBack;
  return (
    <div
      onClick={() => canFlip && onFlip()}
      className={`flashcard-inner w-full h-full relative ${canFlip ? "cursor-pointer" : "cursor-wait"} ${flipped ? "flipped" : ""}`}
      style={{ transformStyle: "preserve-3d" }}
    >
      {/* Front face */}
      <div
        className={`${faceBase} justify-start items-center text-start ${frontPad} ${faceClass}`}
        style={{ backfaceVisibility: "hidden" }}
      >
        {front}
      </div>

      {/* Back face */}
      <div
        className={`flashcard-face flashcard-back absolute inset-0 w-full h-full flex flex-col items-stretch text-start ${backPad} ${faceClass}`}
        style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
      >
        {back}
      </div>
    </div>
  );
}
