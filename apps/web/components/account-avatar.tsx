"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function isSafeProfileImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

type AccountAvatarProps = {
  initials: string;
  /** OAuth / provider picture URL (e.g. session.user.image). Invalid URLs are ignored. */
  imageUrl?: string | null;
  /** Hint for layout; image uses object-cover inside the parent box. */
  sizePx?: number;
  className?: string;
  initialsClassName?: string;
};

/**
 * Circular avatar: shows profile image when URL is valid and the image loads; otherwise initials.
 * Uses no-referrer for third-party provider URLs and onError so a broken image never shows.
 */
export function AccountAvatar({
  initials,
  imageUrl,
  sizePx = 36,
  className,
  initialsClassName,
}: AccountAvatarProps) {
  const trimmed = imageUrl?.trim() ?? "";
  const safeUrl =
    trimmed && isSafeProfileImageUrl(trimmed) ? trimmed : undefined;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [safeUrl]);

  const showPhoto = Boolean(safeUrl) && !imageFailed;

  return (
    <span
      className={cn(
        "relative flex size-full min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-full",
        className
      )}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- provider URLs need referrerPolicy + onError; initials fallback avoids broken UI
        <img
          src={safeUrl}
          alt=""
          width={sizePx}
          height={sizePx}
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover object-center"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span
          className={cn(
            "relative z-[1] text-xs font-medium text-foreground",
            initialsClassName
          )}
        >
          {initials}
        </span>
      )}
    </span>
  );
}
