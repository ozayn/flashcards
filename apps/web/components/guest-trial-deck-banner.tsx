"use client";

import Link from "next/link";
import { GUEST_TRIAL_MAX_CARDS } from "@/lib/guest-trial";

export function GuestTrialDeckBanner({ callbackUrl }: { callbackUrl: string }) {
  return (
    <div
      className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-sm dark:border-amber-500/20 dark:bg-amber-500/[0.08]"
      role="region"
      aria-label="Guest trial"
    >
      <p className="font-medium text-foreground">Trial deck — not saved to your account yet</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        You&apos;re trying MemoNext without signing in (up to {GUEST_TRIAL_MAX_CARDS} AI-generated
        cards per trial deck).{" "}
        <Link
          href={`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
        >
          Sign in
        </Link>{" "}
        to save this deck, create more decks, and continue learning across sessions.
      </p>
    </div>
  );
}
