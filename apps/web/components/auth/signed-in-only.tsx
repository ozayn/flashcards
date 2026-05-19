"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import PageContainer from "@/components/layout/page-container";

type SignedInOnlyProps = {
  children: React.ReactNode;
  /** Headline above the message; defaults to "Sign in to continue". */
  title?: string;
  /** Plain-language reason the page is gated. */
  reason?: string;
  /** Where to send the user back after sign-in (defaults to current path). */
  callbackUrlOverride?: string;
};

/**
 * Renders children only when a user is signed in. While the session is loading we render
 * nothing to avoid flashing the gate UI; signed-out users see a centered sign-in prompt
 * with a callbackUrl back to the same page (Library + Home links as alternatives).
 */
export function SignedInOnly({
  children,
  title = "Sign in to continue",
  reason = "This area is part of your personal MemoNext workspace.",
  callbackUrlOverride,
}: SignedInOnlyProps) {
  const { status } = useSession();
  const pathname = usePathname();
  const sp = useSearchParams();

  if (status === "loading") {
    return null;
  }
  if (status === "unauthenticated") {
    const fallback = callbackUrlOverride ?? (() => {
      const qs = sp?.toString();
      return qs ? `${pathname}?${qs}` : pathname || "/";
    })();
    const callbackUrl = encodeURIComponent(fallback);
    return (
      <PageContainer>
        <div className="mx-auto max-w-md space-y-4 px-4 py-12 text-center">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{reason}</p>
          <div className="flex flex-col items-center gap-2">
            <Link href={`/signin?callbackUrl=${callbackUrl}`}>
              <Button size="sm" className="rounded-lg">Sign in</Button>
            </Link>
            <p className="text-xs text-muted-foreground">
              or browse the public <Link href="/library" className="underline-offset-2 hover:underline">Library</Link>
              {" · "}
              <Link href="/" className="underline-offset-2 hover:underline">Home</Link>
            </p>
          </div>
        </div>
      </PageContainer>
    );
  }
  return <>{children}</>;
}
