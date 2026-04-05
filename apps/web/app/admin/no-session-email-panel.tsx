"use client";

import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function AdminNoSessionEmailPanel() {
  return (
    <div className="max-w-md mx-auto px-4 py-16 space-y-4">
      <h1 className="text-xl font-semibold">Admin</h1>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Your session does not include an email address. Sign in with Google so
        we can check admin access.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => signIn(undefined, { callbackUrl: "/admin" })}
        >
          Sign in with Google
        </Button>
        <Link
          href="/"
          className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
        >
          Home
        </Link>
        <Button
          type="button"
          variant="outline"
          onClick={() => void signOut({ callbackUrl: "/" })}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
