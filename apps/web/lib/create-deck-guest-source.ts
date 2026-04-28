/**
 * Signed-out guest trial: only simple sources. Extend via isSourceModeLockedForGuest + guestSourceLockCopy.
 */

export type CreateDeckSourceMode =
  | "topic"
  | "text"
  | "youtube"
  | "url"
  | "import";

export function isSourceModeLockedForGuest(mode: CreateDeckSourceMode): boolean {
  return mode === "youtube" || mode === "url" || mode === "import";
}

export type GuestSourceLockKind = "youtube" | "url" | "import";

export function guestSourceLockCopy(kind: GuestSourceLockKind): {
  headline: string;
  subline: string;
} {
  const subline = "Sign in to create decks from YouTube, URLs, and imports.";
  if (kind === "youtube") {
    return {
      headline: "YouTube deck creation is available after sign-in.",
      subline,
    };
  }
  if (kind === "url") {
    return {
      headline: "URL deck creation is available after sign-in.",
      subline,
    };
  }
  return {
    headline: "Import is available after sign-in.",
    subline,
  };
}

/** Signed out and `NEXT_PUBLIC_GUEST_TRIAL_USER_ID` unset: full page is sign-in-first. */
export function signedOutNoGuestTrialCopy(): {
  headline: string;
  body: string;
  note: string;
} {
  return {
    headline: "Sign in to create decks",
    body: "Sign in to create decks and save them to your account.",
    note: "Guest trial is not enabled on this server.",
  };
}
