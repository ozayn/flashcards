"use client";

import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function AdminNoSessionEmailPanel() {
  return (
    <div className="mx-auto max-w-md space-y-3 px-4 py-10">
      <h1 className="text-base font-semibold">Admin</h1>
      <p className="text-sm text-muted-foreground">
        No email on this session. Sign in with Google to check access.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => signIn(undefined, { callbackUrl: "/admin" })}
        >
          Sign in
        </Button>
        <Link
          href="/"
          className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-muted"
        >
          Home
        </Link>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => void signOut({ callbackUrl: "/" })}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
