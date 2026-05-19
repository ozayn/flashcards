"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Minimal Share action for the deck detail page.
 *
 * Caller must only render this on pages where sharing the link makes sense (i.e. the
 * recipient can actually open the URL without auth). This component does NOT make that
 * decision itself — see DeckPage for the `deck.is_public` gating.
 *
 * Behaviour:
 * - When `navigator.share` exists (iOS Safari, Android Chrome, most installed PWAs), tap
 *   opens the native share sheet pre-filled with the deck title and URL.
 * - When `navigator.share` is missing (most desktop browsers), tap copies the deck URL to
 *   the clipboard via `navigator.clipboard.writeText` and the button briefly shows a
 *   "Copied" / "Link copied" confirmation in place of the icon.
 * - If the share sheet is dismissed by the user (`AbortError`), the button does nothing
 *   visible — that is the standard Web Share API user-cancel signal.
 */

type DeckShareButtonProps = {
  deckId: string;
  deckTitle: string;
  /** Optional override; defaults to `${window.location.origin}/decks/{id}`. */
  shareUrl?: string;
};

/** How long the "Copied" / "Shared" confirmation stays on the button before reverting. */
const CONFIRMATION_TIMEOUT_MS = 1800;

type Status = "idle" | "copied" | "shared" | "error";

function getDeckShareUrl(deckId: string, override: string | undefined): string {
  if (override) return override;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/decks/${encodeURIComponent(deckId)}`;
  }
  /** Server fallback (matters for the first paint before hydration; the click handler always re-resolves on the client). */
  return `/decks/${encodeURIComponent(deckId)}`;
}

export function DeckShareButton({ deckId, deckTitle, shareUrl }: DeckShareButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const resetSoon = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setStatus("idle");
      timerRef.current = null;
    }, CONFIRMATION_TIMEOUT_MS);
  }, []);

  const handleClick = useCallback(async () => {
    const url = getDeckShareUrl(deckId, shareUrl);
    const title = (deckTitle?.trim() || "MemoNext deck").slice(0, 200);

    /** Prefer the native share sheet when available — mobile / PWA users expect it. */
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url, text: title });
        setStatus("shared");
        resetSoon();
        return;
      } catch (err: unknown) {
        /** User dismissed the sheet — leave the button untouched, do not fall back to clipboard. */
        if (err instanceof DOMException && err.name === "AbortError") return;
        /** Real share failure (rare): fall through to clipboard so the user still gets the URL. */
      }
    }

    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      try {
        await navigator.clipboard.writeText(url);
        setStatus("copied");
        resetSoon();
        return;
      } catch {
        /* fall through to the legacy fallback below */
      }
    }

    /** Last-resort fallback for very old browsers / non-secure contexts where clipboard API is unavailable. */
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand?.("copy") === true;
      document.body.removeChild(ta);
      if (ok) {
        setStatus("copied");
        resetSoon();
        return;
      }
    } catch {
      /* ignore */
    }
    setStatus("error");
    resetSoon();
  }, [deckId, deckTitle, shareUrl, resetSoon]);

  const label =
    status === "copied"
      ? "Link copied"
      : status === "shared"
        ? "Shared"
        : status === "error"
          ? "Copy failed — long-press the URL to share"
          : "Share deck";

  const ShowingConfirmation = status === "copied" || status === "shared";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      className="h-9 w-9 p-0 text-muted-foreground border-border/80"
      aria-label={label}
      title={label}
    >
      {ShowingConfirmation ? (
        <Check className="size-4 shrink-0 opacity-80" aria-hidden />
      ) : (
        <Share2 className="size-4 shrink-0 opacity-80" aria-hidden />
      )}
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
    </Button>
  );
}
