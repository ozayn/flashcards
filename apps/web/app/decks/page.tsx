"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getUsers, getDecks, updateDeck, apiUrl } from "@/lib/api";
import { getStoredUserId } from "@/components/user-selector";
import PageContainer from "@/components/layout/page-container";

export type Deck = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  source_type: string;
  source_url: string | null;
  source_text: string | null;
  archived: boolean;
  created_at: string;
};

export default function DecksPage() {
  const router = useRouter();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [decksError, setDecksError] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    async function resolveUserId() {
      const stored = getStoredUserId();
      if (stored) {
        setUserId(stored);
        return;
      }
      try {
        const users = await getUsers();
        if (Array.isArray(users) && users.length > 0) {
          setUserId(users[0].id);
        }
      } catch {
        setUserId(null);
      }
    }
    resolveUserId();
  }, []);

  useEffect(() => {
    const handleUserChanged = () => setUserId(getStoredUserId());
    window.addEventListener("flashcard_user_changed", handleUserChanged);
    return () => window.removeEventListener("flashcard_user_changed", handleUserChanged);
  }, []);

  useEffect(() => {
    if (!userId) {
      setDecks([]);
      return;
    }
    const uid = userId;
    async function fetchDecks() {
      try {
        setDecksError(false);
        const data = await getDecks(uid, showArchived);
        setDecks(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load decks", err);
        setDecks([]);
        setDecksError(true);
      }
    }
    fetchDecks();
  }, [userId, showArchived]);

  async function handleArchiveDeck(deckId: string, archive: boolean, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await updateDeck(deckId, { archived: archive });
      setDecks((d) => d.filter((deck) => deck.id !== deckId));
    } catch {
      // ignore
    }
  }

  return (
    <PageContainer>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Decks</h1>
          <Link
            href="/create-deck"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            Create Deck
          </Link>
        </div>

        <p className="text-muted-foreground text-sm">
          Your flashcard decks will appear here.
        </p>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-input"
          />
          Show archived decks
        </label>

        <div className="space-y-3">
          {decksError ? (
            <Card>
              <CardHeader>
                <CardTitle>Unable to load decks</CardTitle>
                <CardDescription>
                  The API may be unavailable. Ensure the backend is running and refresh the page. Configured API: {apiUrl}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : decks.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  {showArchived ? "No archived decks" : "Getting Started"}
                </CardTitle>
                <CardDescription>
                  {showArchived
                    ? "Archived decks will appear here."
                    : "Create your first deck to get started"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!showArchived && (
                  <Link
                    href="/create-deck"
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
                  >
                    Create Deck
                  </Link>
                )}
              </CardContent>
            </Card>
          ) : (
            decks.map((deck) => (
              <div
                key={deck.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/decks/${deck.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/decks/${deck.id}`);
                  }
                }}
                className="rounded-xl border border-neutral-200 px-4 py-3 flex items-start justify-between gap-3 bg-white hover:bg-muted transition dark:bg-neutral-900 dark:border-neutral-700 cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col gap-1">
                    <div className="font-medium text-base leading-snug">
                      {deck.name}
                    </div>
                    <div className="text-sm text-neutral-500 leading-snug dark:text-neutral-400">
                      {deck.description || ""}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleArchiveDeck(deck.id, !showArchived, e);
                  }}
                  className="flex-shrink-0 mt-1 text-muted-foreground hover:text-foreground"
                  aria-label={showArchived ? "Unarchive deck" : "Archive deck"}
                >
                  {showArchived ? (
                    <ArchiveRestore className="size-4" />
                  ) : (
                    <Archive className="size-4" />
                  )}
                </Button>
              </div>
            ))
          )}
        </div>
    </PageContainer>
  );
}