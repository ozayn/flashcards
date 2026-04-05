"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function AdminNotAuthorizedPanel() {
  return (
    <div className="max-w-md mx-auto px-4 py-16 space-y-4">
      <h1 className="text-xl font-semibold">Not authorized</h1>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Your Google account is not in the admin email allowlist (configure{" "}
        <code className="text-xs bg-muted px-1 rounded">ADMIN_EMAILS</code> on
        the server).
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/"
          className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
        >
          Back to home
        </Link>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void signOut({ callbackUrl: "/" })}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
