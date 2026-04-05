"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

function signInErrorMessage(error: string | null): string | null {
  if (!error) return null;
  if (error === "AccessDenied") {
    return "This Google account isn’t allowed to sign in. Use an email on the app allowlist (exact address from Google). Check server logs for “[auth] Google sign-in AccessDenied”.";
  }
  if (error === "Callback") {
    return "Sign-in couldn’t finish. The account may not be authorized.";
  }
  return null;
}

function SignInFormInner({
  googleConfigured,
  missingRequiredKeys,
  nextAuthUrlPresent,
}: {
  googleConfigured: boolean;
  missingRequiredKeys: string[];
  nextAuthUrlPresent: boolean;
}) {
  const params = useSearchParams();
  const oauthError = params.get("error");
  const oauthMessage = signInErrorMessage(oauthError);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setLocalError(null);
    setBusy(true);
    try {
      await signIn("google", { callbackUrl: "/decks" });
    } catch {
      setLocalError("Something went wrong. Try again.");
      setBusy(false);
    }
  };

  const errorText =
    localError ??
    oauthMessage ??
    (oauthError === "Configuration"
      ? "Sign-in isn’t configured on this server."
      : oauthError
        ? "Sign-in didn’t complete. Try again."
        : null);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="w-full max-w-[22rem] space-y-5 rounded-xl border border-border/60 bg-card px-6 py-7 shadow-sm">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 rounded-lg py-0.5 outline-none ring-offset-background transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="MemoNext home"
        >
          <Logo size="sm" alt="" />
          <span className="text-sm font-semibold tracking-tight">MemoNext</span>
        </Link>

        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
          <p className="text-xs text-muted-foreground">Continue with your Google account.</p>
        </div>

        {errorText ? (
          <p
            className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-center text-sm text-destructive"
            role="alert"
          >
            {errorText}
          </p>
        ) : null}

        <Button
          className="h-11 w-full gap-2 font-medium"
          disabled={!googleConfigured || busy}
          onClick={() => void handleGoogle()}
        >
          <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          {busy ? "Redirecting…" : "Continue with Google"}
        </Button>

        {!googleConfigured ? (
          <div className="space-y-1 text-center text-xs text-muted-foreground">
            <p>Add Google OAuth env vars to the web app and restart.</p>
            {missingRequiredKeys.length > 0 ? (
              <p className="break-words font-mono text-[11px] text-foreground/80">
                Missing: {missingRequiredKeys.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}

        {googleConfigured && !nextAuthUrlPresent ? (
          <p className="text-center text-xs text-amber-800/90 dark:text-amber-400/90">
            Set <span className="font-mono">NEXTAUTH_URL</span> to your public site URL for OAuth redirects.
          </p>
        ) : null}

        <p className="text-center">
          <Link
            href="/decks"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Continue without signing in
          </Link>
        </p>
      </div>
    </div>
  );
}

export function SignInForm({
  googleConfigured,
  missingRequiredKeys,
  nextAuthUrlPresent,
}: {
  googleConfigured: boolean;
  missingRequiredKeys: string[];
  nextAuthUrlPresent: boolean;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
          <Logo size="sm" alt="" />
          <span>Loading…</span>
        </div>
      }
    >
      <SignInFormInner
        googleConfigured={googleConfigured}
        missingRequiredKeys={missingRequiredKeys}
        nextAuthUrlPresent={nextAuthUrlPresent}
      />
    </Suspense>
  );
}
