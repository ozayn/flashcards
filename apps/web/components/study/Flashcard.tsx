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
  /**
   * Extra inline-end + block-start inset for a top-inline-end bookmark.
   * Parent also renders a top-inline-start speak control; all pads reserve space for both
   * (BCP-47 `ps` / `pe` / `pt` so RTL stays correct with dir=auto).
   */
  reserveBookmarkCorner?: boolean;
}

/* Speak (h-8) at start-2 / top-2: needs ~2.5rem+ inset. Bookmark h-8 at end-2: pe-10+ in reserve. */
const _padDefaultFront =
  "ps-6 pe-6 pt-10 pb-6 md:ps-10 md:pe-10 md:pt-10 md:pb-10 lg:ps-12 lg:pe-12 lg:pt-12 lg:pb-12 " +
  "landscape-mobile:pt-11 landscape-mobile:ps-10 landscape-mobile:pe-3 landscape-mobile:pb-2";
const _padReserveFront =
  "ps-6 pe-12 pt-10 pb-6 md:ps-10 md:pe-14 md:pt-10 md:pb-10 lg:ps-12 lg:pe-16 lg:pt-12 lg:pb-12 " +
  "landscape-mobile:pt-11 landscape-mobile:ps-10 landscape-mobile:pe-10 landscape-mobile:pb-2";
const _padDefaultBack =
  "ps-6 pe-6 pt-10 pb-4 md:ps-10 md:pe-10 md:pt-10 md:pb-4 lg:ps-12 lg:pe-12 lg:pt-10 lg:pb-4 " +
  "landscape-mobile:pt-11 landscape-mobile:ps-10 landscape-mobile:pe-3 landscape-mobile:pb-1.5";
const _padReserveBack =
  "ps-6 pe-12 pt-10 pb-4 md:ps-10 md:pe-14 md:pt-10 md:pb-4 lg:ps-12 lg:pe-16 lg:pt-10 lg:pb-4 " +
  "landscape-mobile:pt-11 landscape-mobile:ps-10 landscape-mobile:pe-10 landscape-mobile:pb-1.5";

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
