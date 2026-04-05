"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { postAdminTransferDeckToMe } from "@/lib/api";

export type AdminTransferDeckSnapshot = {
  id: string;
  owner_name?: string | null;
  owner_email?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deck: AdminTransferDeckSnapshot | null;
  onTransferred?: (updatedDeck: unknown) => void | Promise<void>;
};

export function AdminTransferDeckConfirmModal({
  open,
  onOpenChange,
  deck,
  onTransferred,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  async function handleConfirm() {
    if (!deck) return;
    setBusy(true);
    setError(null);
    try {
      const data = await postAdminTransferDeckToMe(deck.id);
      await onTransferred?.(data);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open || !deck) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !busy && onOpenChange(false)}
    >
      <div
        className="bg-background rounded-lg shadow-lg p-6 w-full max-w-md border border-border"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-deck-title"
      >
        <h2 id="transfer-deck-title" className="text-lg font-semibold mb-3">
          Move deck to your account?
        </h2>
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          This is a <span className="font-medium text-foreground">move</span>, not a copy. The
          deck will no longer belong to the current owner.
        </p>
        <ul className="text-sm space-y-2 mb-4 text-muted-foreground">
          <li>
            <span className="text-foreground font-medium">Current owner:</span>{" "}
            {deck.owner_name ?? "—"}{" "}
            <span className="break-all text-foreground/90">({deck.owner_email ?? "—"})</span>
          </li>
          <li>
            <span className="text-foreground font-medium">Destination:</span> Your Google-linked
            account
          </li>
        </ul>
        <p className="text-xs text-muted-foreground mb-4">
          Title, description, cards, and sources are kept. Study progress (reviews) on these
          cards will be reset. The deck becomes private.
        </p>
        {error && (
          <p className="text-sm text-destructive mb-4" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void handleConfirm()}>
            {busy ? "Moving…" : "Move deck"}
          </Button>
        </div>
      </div>
    </div>
  );
}
