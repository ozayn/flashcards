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

interface DeckPageProps {
  params: { id: string };
}

interface Deck {
  id: string;
  name: string;
  description: string | null;
}

interface Flashcard {
  id: string;
  question: string;
  answer_short: string;
}

export default function DeckPage({ params }: DeckPageProps) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchDeck() {
      try {
        const res = await fetch(
          `${apiUrl}/decks/${params.id}`
        );
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setDeck(data);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    fetchDeck();
  }, [params.id]);

  useEffect(() => {
    if (!deck) return;

    async function fetchFlashcards() {
      try {
        const res = await fetch(
          `${apiUrl}/decks/${params.id}/flashcards`
        );
        if (res.ok) {
          const data = await res.json();
          setFlashcards(data);
        }
      } catch {
        // ignore
      }
    }

    fetchFlashcards();
  }, [deck, params.id]);

  if (loading) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-2xl mx-auto">
          <p className="text-muted-foreground">Loading deck...</p>
        </div>
      </main>
    );
  }

  if (notFound || !deck) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <Link
            href="/decks"
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
          >
            ← Back
          </Link>
          <p className="text-muted-foreground">Deck not found.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link
          href="/decks"
          className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
        >
          ← Back
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>{deck.name}</CardTitle>
            <CardDescription>
              {deck.description || "No description"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link
              href={`/study?deck=${deck.id}`}
              className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              Study
            </Link>
            <Link
              href={`/decks/${deck.id}/add-card`}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
            >
              Add Card
            </Link>
          </CardContent>
        </Card>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Flashcards</h2>
          {flashcards.length === 0 ? (
            <p className="text-muted-foreground text-sm">No flashcards yet.</p>
          ) : (
            <div className="space-y-3">
              {flashcards.map((card) => (
                <Card key={card.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{card.question}</CardTitle>
                    <CardDescription>{card.answer_short}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
