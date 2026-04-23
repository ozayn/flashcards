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
  /** Extra inline-end + block-start inset for a corner bookmark (parent should set dir). */
  reserveBookmarkCorner?: boolean;
}

/**
 * Reusable flashcard that shows question first and flips to answer on click.
 * Uses same proportions as study mode (aspect-[3/2], max-w-2xl) and shared flashcard CSS.
 * Supports controlled mode (flipped + onFlip) for external triggers (e.g. Space key).
 */
/** Match study Flashcard: reserve space for h-8 speak (start) + optional bookmark (end) at top-2. */
const _flipPadFrontDefault =
  "ps-6 pe-6 pt-10 pb-6 md:ps-10 md:pe-10 md:pt-10 md:pb-10 lg:ps-12 lg:pe-12 lg:pt-12 lg:pb-12 " +
  "landscape-mobile:pt-11 landscape-mobile:ps-10 landscape-mobile:pe-3 landscape-mobile:pb-2";
const _flipPadFrontReserve =
  "ps-6 pe-12 pt-10 pb-6 md:ps-10 md:pe-14 md:pt-10 md:pb-10 lg:ps-12 lg:pe-16 lg:pt-12 lg:pb-12 " +
  "landscape-mobile:pt-11 landscape-mobile:ps-10 landscape-mobile:pe-10 landscape-mobile:pb-2";
const _flipPadBackDefault =
  "ps-6 pe-6 pt-10 pb-4 md:ps-10 md:pe-10 md:pt-10 md:pb-4 lg:ps-12 lg:pe-12 lg:pt-10 lg:pb-4 " +
  "landscape-mobile:pt-11 landscape-mobile:ps-10 landscape-mobile:pe-3 landscape-mobile:pb-1.5";
const _flipPadBackReserve =
  "ps-6 pe-12 pt-10 pb-4 md:ps-10 md:pe-14 md:pt-10 md:pb-4 lg:ps-12 lg:pe-16 lg:pt-10 lg:pb-4 " +
  "landscape-mobile:pt-11 landscape-mobile:ps-10 landscape-mobile:pe-10 landscape-mobile:pb-1.5";

export function FlashcardFlip({
  question,
  answer,
  className,
  flipped: controlledFlipped,
  onFlip,
  reserveBookmarkCorner = false,
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
        "flashcard relative w-full max-w-2xl sm:max-w-3xl aspect-[3/2] overflow-hidden rounded-2xl",
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
        <div
          className={cn(
            "flashcard-face flashcard-front absolute inset-0 w-full h-full flex flex-col items-stretch justify-start text-start rounded-2xl border border-neutral-200 shadow-lg flashcard-paper dark:border-neutral-700",
            reserveBookmarkCorner ? _flipPadFrontReserve : _flipPadFrontDefault
          )}
        >
          <div className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden">
            {question}
          </div>
        </div>

        {/* Back face - answer */}
        <div
          className={cn(
            "flashcard-face flashcard-back absolute inset-0 w-full h-full flex flex-col items-stretch justify-start text-start rounded-2xl border border-neutral-200 shadow-lg flashcard-paper dark:border-neutral-700",
            reserveBookmarkCorner ? _flipPadBackReserve : _flipPadBackDefault
          )}
        >
          <div className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden">
            {answer}
          </div>
        </div>
      </div>
    </div>
  );
}
