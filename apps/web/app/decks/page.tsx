"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiUrl } from "@/lib/api";

export type Deck = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  source_type: string;
  source_url: string | null;
  source_text: string | null;
  created_at: string;
};

export default function DecksPage() {
  const [decks, setDecks] = useState<Deck[]>([]);

  useEffect(() => {
    async function fetchDecks() {
      try {
        const res = await fetch(`${apiUrl}/decks?user_id=d3b5a509-1d7b-4f11-b20c-2dc78dc3b093`);
        const data = await res.json();
        // API returns array directly: [{ id, user_id, name, ... }, ...]
        setDecks(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load decks", err);
        setDecks([]);
      }
    }

    fetchDecks();
  }, []);

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Decks</h1>
          <Link
            href="/create-deck"
            className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            Create Deck
          </Link>
        </div>

        <p className="text-muted-foreground text-sm">
          Your flashcard decks will appear here.
        </p>

        <div className="grid gap-4">
          {decks.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Getting Started</CardTitle>
                <CardDescription>
                  Create your first deck to get started
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href="/create-deck"
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
                >
                  Create Deck
                </Link>
              </CardContent>
            </Card>
          ) : (
            decks.map((deck) => (
              <Link key={deck.id} href={`/decks/${deck.id}`}>
                <Card className="hover:bg-muted cursor-pointer transition">
                  <CardHeader>
                    <CardTitle>{deck.name}</CardTitle>
                    <CardDescription>{deck.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>
    </main>
  );
}