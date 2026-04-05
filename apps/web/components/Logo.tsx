"use client";

import Image from "next/image";

const sizeMap = {
  sm: 24,
  md: 32,
  lg: 48,
} as const;

export type LogoSize = keyof typeof sizeMap;

interface LogoProps {
  size?: LogoSize;
  className?: string;
  /** Use empty string when the logo sits inside a control that already has an accessible name (e.g. home link with aria-label). */
  alt?: string;
}

/**
 * Reusable logo component with dark mode compatibility.
 * Applies slight brightness filter in dark mode for visibility.
 */
export function Logo({ size = "md", className = "", alt = "MemoNext" }: LogoProps) {
  const height = sizeMap[size];

  return (
    <Image
      src="/logo/brain_stack_512.png"
      alt={alt}
      width={height}
      height={height}
      className={`dark:invert ${className}`}
      style={{ height: `${height}px`, width: "auto" }}
      priority
    />
  );
}
