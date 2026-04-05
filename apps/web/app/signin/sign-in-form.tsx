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
    return "Your Google email is not on ALLOWED_LOGIN_EMAILS for this web app (trim + lowercase per entry; Gmail dots and +tags are not normalized—list the exact address Google returns). Check the Next.js server logs for \"[auth] Google sign-in AccessDenied\" (includes comparedEmail and denyReason). Set SIGNIN_ALLOWLIST_DEBUG=1 on the web server for a full allowlist trace on each attempt.";
  }
  if (error === "Callback") {
    return "Sign-in could not be completed. Your account may not be authorized, or the server rejected the login.";
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
      setLocalError("Sign-in failed. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-5 sm:px-6 py-10">
      <div className="w-full max-w-sm space-y-8">
        <header className="text-center space-y-4 sm:space-y-5">
          <Link
            href="/"
            className="group inline-flex flex-col items-center gap-2 sm:gap-2.5 rounded-xl px-3 py-2 -mx-1 outline-none ring-offset-background transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="MemoNext home"
          >
            <span className="shrink-0 leading-none">
              <span className="sm:hidden">
                <Logo size="md" alt="" />
              </span>
              <span className="hidden sm:inline-block">
                <Logo size="lg" alt="" />
              </span>
            </span>
            <span className="font-semibold text-lg tracking-tight text-foreground sm:text-xl">
              MemoNext
            </span>
          </Link>
          <div className="space-y-1.5 px-1">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Sign in
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Save decks, sync progress, and review anywhere.
            </p>
          </div>
        </header>

        {(oauthMessage || oauthError || localError) && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-center">
            <p className="text-sm text-destructive">
              {localError ??
                oauthMessage ??
                (oauthError === "Configuration"
                  ? "Sign-in is not configured on this server."
                  : "We couldn’t complete sign-in. Please try again.")}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-center gap-2.5 h-11"
            disabled={!googleConfigured || busy}
            onClick={() => void handleGoogle()}
          >
            <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
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

          {!googleConfigured && (
            <div className="text-xs text-center text-muted-foreground space-y-1.5">
              <p>
                Google sign-in needs required variables on the{" "}
                <span className="font-medium text-foreground/80">web</span> service at{" "}
                <span className="font-medium text-foreground/80">runtime</span>. After
                changing env, redeploy or restart the web app.
              </p>
              {missingRequiredKeys.length > 0 ? (
                <p className="font-mono text-[11px] sm:text-xs text-foreground/90 break-words">
                  Missing or empty: {missingRequiredKeys.join(", ")}
                </p>
              ) : null}
            </div>
          )}
          {googleConfigured && !nextAuthUrlPresent ? (
            <p className="text-xs text-center text-amber-800/90 dark:text-amber-400/85">
              NEXTAUTH_URL is not set. Set it to your public site origin (e.g.{" "}
              <span className="whitespace-nowrap">https://your-domain.com</span>) so OAuth
              callbacks work, unless your host injects it automatically.
            </p>
          ) : null}

          <Button
            variant="outline"
            className="w-full justify-center gap-2.5 h-11"
            disabled
            type="button"
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            Continue with email
            <span className="sr-only">(coming soon)</span>
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Email sign-in is coming soon.
          </p>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/60" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-3 text-muted-foreground">or</span>
          </div>
        </div>

        <div className="text-center">
          <Link
            href="/decks"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Continue without signing in →
          </Link>
        </div>
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
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 py-10 text-muted-foreground">
          <Logo size="md" alt="" />
          <span className="text-sm">Loading…</span>
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
