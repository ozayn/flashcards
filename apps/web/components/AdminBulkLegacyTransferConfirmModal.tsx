"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { postAdminTransferAllLegacyDecksFromUser } from "@/lib/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceUserId: string | null;
  ownerName: string;
  ownerEmail: string;
  deckCount: number;
  onTransferred?: (payload: { moved_count: number; deck_ids: string[] }) => void | Promise<void>;
};

export function AdminBulkLegacyTransferConfirmModal({
  open,
  onOpenChange,
  sourceUserId,
  ownerName,
  ownerEmail,
  deckCount,
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
    if (!sourceUserId) return;
    setBusy(true);
    setError(null);
    try {
      const data = await postAdminTransferAllLegacyDecksFromUser(sourceUserId);
      await onTransferred?.(data);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open || !sourceUserId) return null;

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
        aria-labelledby="bulk-transfer-deck-title"
      >
        <h2 id="bulk-transfer-deck-title" className="text-lg font-semibold mb-3">
          Move all decks to your account?
        </h2>
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          This is a <span className="font-medium text-foreground">move</span>, not a copy. Decks will
          no longer belong to the current owner.
        </p>
        <ul className="text-sm space-y-2 mb-4 text-muted-foreground">
          <li>
            <span className="text-foreground font-medium">Current owner:</span> {ownerName}{" "}
            <span className="break-all text-foreground/90">({ownerEmail})</span>
          </li>
          <li>
            <span className="text-foreground font-medium">Decks to move:</span>{" "}
            <span className="text-foreground tabular-nums">{deckCount}</span>
            {deckCount === 1 ? " deck" : " decks"} (including archived, if any)
          </li>
          <li>
            <span className="text-foreground font-medium">Destination:</span> Your Google-linked
            account
          </li>
        </ul>
        <p className="text-xs text-muted-foreground mb-4">
          Titles, descriptions, cards, and sources are kept for each deck. Study progress (reviews)
          on those cards will be reset. Every moved deck becomes private.
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
            {busy ? "Moving…" : deckCount === 0 ? "Confirm" : `Move ${deckCount} deck${deckCount === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
