"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getDeck,
  getFlashcards,
  generateFlashcards,
  updateDeck,
  deleteDeck,
  deleteFlashcard,
} from "@/lib/api";

interface DeckPageProps {
  params: { id: string };
}

interface Deck {
  id: string;
  name: string;
  description: string | null;
  archived?: boolean;
}

interface Flashcard {
  id: string;
  question: string;
  answer_short: string;
}

export default function DeckPage({ params }: DeckPageProps) {
  const router = useRouter();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [title, setTitle] = useState(deck?.name ?? "");
  const [description, setDescription] = useState(deck?.description ?? "");

  useEffect(() => {
    async function fetchDeck() {
      try {
        const data = await getDeck(params.id);
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
    if (deck) {
      setTitle(deck.name ?? "");
      setDescription(deck.description ?? "");
    }
  }, [deck]);

  useEffect(() => {
    if (!deck) return;

    async function fetchFlashcards() {
      try {
        const data = await getFlashcards(params.id);
        setFlashcards(Array.isArray(data) ? data : []);
      } catch {
        // ignore
      }
    }

    fetchFlashcards();
  }, [deck, params.id]);

  async function handleGenerate() {
    if (!deck || generating) return;
    setGenerating(true);
    try {
      await generateFlashcards({
        deck_id: deck.id,
        topic: deck.name,
        num_cards: 5,
      });
      const data = await getFlashcards(params.id);
      setFlashcards(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteDeck() {
    if (!deck) return;
    if (!confirm("Delete this deck and all its cards?")) return;
    try {
      await deleteDeck(deck.id);
      router.push("/decks");
    } catch {
      // ignore
    }
  }

  async function handleDeleteCard(cardId: string) {
    if (!confirm("Delete this card?")) return;
    try {
      await deleteFlashcard(cardId);
      setFlashcards((f) => f.filter((c) => c.id !== cardId));
    } catch {
      // ignore
    }
  }

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
          <CardHeader className="space-y-2">
            {editingTitle ? (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={async () => {
                  if (deck) {
                    try {
                      await updateDeck(deck.id, { name: title });
                      const data = await getDeck(params.id);
                      setDeck(data);
                    } catch {
                      // ignore
                    }
                  }
                  setEditingTitle(false);
                }}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && deck) {
                    try {
                      await updateDeck(deck.id, { name: title });
                      const data = await getDeck(params.id);
                      setDeck(data);
                    } catch {
                      // ignore
                    }
                    setEditingTitle(false);
                  }
                }}
                className="text-2xl font-semibold border rounded px-2 py-1 w-full"
                autoFocus
              />
            ) : (
              <h1
                className="text-2xl font-semibold cursor-pointer"
                onClick={() => setEditingTitle(true)}
              >
                {title}
              </h1>
            )}
            {editingDescription ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={async () => {
                  if (deck) {
                    try {
                      await updateDeck(deck.id, { description });
                      const data = await getDeck(params.id);
                      setDeck(data);
                    } catch {
                      // ignore
                    }
                  }
                  setEditingDescription(false);
                }}
                className="border rounded px-2 py-1 w-full min-h-[80px]"
                autoFocus
              />
            ) : (
              <p
                className="text-muted-foreground cursor-pointer"
                onClick={() => setEditingDescription(true)}
              >
                {description || "Click to add description"}
              </p>
            )}
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row flex-wrap gap-3">
            <Link
              href={`/study/${deck.id}`}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80 w-full sm:w-auto"
            >
              Study
            </Link>
            <Link
              href={`/decks/${deck.id}/add-card`}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted w-full sm:w-auto"
            >
              Add Card
            </Link>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:pointer-events-none w-full sm:w-auto"
            >
              {generating ? "Generating..." : "Generate Flashcards"}
            </button>
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await updateDeck(deck.id, { archived: !deck.archived });
                  router.push("/decks");
                } catch {
                  // ignore
                }
              }}
              className="w-full sm:w-auto"
            >
              {deck.archived ? "Unarchive" : "Archive"}
            </Button>
            <Button
              variant="ghost"
              onClick={handleDeleteDeck}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full sm:w-auto"
            >
              Delete Deck
            </Button>
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
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">{card.question}</CardTitle>
                      <CardDescription>{card.answer_short}</CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteCard(card.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Delete card"
                    >
                      <Trash2 className="size-4" />
                    </Button>
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
