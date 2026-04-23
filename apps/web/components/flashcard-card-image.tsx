"use client";

import { useEffect, useState } from "react";
import { flashcardImageRequestUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export type FlashcardCardImageSize = "sm" | "md" | "lg";

const sizeClass: Record<FlashcardCardImageSize, string> = {
  sm: "max-h-24 sm:max-h-28",
  md: "max-h-40 sm:max-h-48",
  lg: "max-h-[min(45vh,22rem)] sm:max-h-[min(50vh,24rem)]",
};

type FlashcardCardImageProps = {
  imageUrl: string | null | undefined;
  className?: string;
  size?: FlashcardCardImageSize;
};

/**
 * Renders an optional card image with bounded size; hides on load error.
 */
export function FlashcardCardImage({
  imageUrl,
  className,
  size = "md",
}: FlashcardCardImageProps) {
  const [broken, setBroken] = useState(false);
  const src = flashcardImageRequestUrl(imageUrl);

  useEffect(() => {
    setBroken(false);
  }, [imageUrl]);

  if (!src || broken) return null;

  return (
    <div
      className={cn(
        "w-full min-w-0 flex justify-center overflow-hidden rounded-lg",
        className
      )}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={cn(
          "h-auto w-full object-contain rounded-md border border-border/50 bg-muted/20",
          sizeClass[size]
        )}
      />
    </div>
  );
}
