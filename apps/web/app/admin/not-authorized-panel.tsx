"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function AdminNotAuthorizedPanel() {
  return (
    <div className="mx-auto max-w-md space-y-3 px-4 py-10">
      <h1 className="text-base font-semibold">Not authorized</h1>
      <p className="text-sm text-muted-foreground">
        This account is not in{" "}
        <code className="rounded bg-muted px-1 font-mono text-xs">ADMIN_EMAILS</code>.
      </p>
      <div className="flex flex-wrap gap-2">
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
