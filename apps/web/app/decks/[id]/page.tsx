"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getDeck,
  getFlashcards,
  generateFlashcards,
  updateDeck,
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
    let cancelled = false;
    async function fetchData() {
      try {
        const [deckData, flashcardsData] = await Promise.all([
          getDeck(params.id),
          getFlashcards(params.id),
        ]);
        if (!cancelled) {
          setDeck(deckData);
          setFlashcards(Array.isArray(flashcardsData) ? flashcardsData : []);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [params.id]);

  useEffect(() => {
    if (deck) {
      setTitle(deck.name ?? "");
      setDescription(deck.description ?? "");
    }
  }, [deck]);

  async function handleGenerate() {
    if (!deck || generating) return;
    setGenerating(true);
    try {
      await generateFlashcards({
        deck_id: deck.id,
        topic: deck.name,
        num_cards: 10,
      });
      const data = await getFlashcards(params.id);
      setFlashcards(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setGenerating(false);
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
        <div className="flex items-center justify-between">
          <Link
            href="/decks"
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
          >
            ← Back
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              try {
                await updateDeck(deck.id, { archived: !deck.archived });
                router.push("/decks");
              } catch {
                // ignore
              }
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label={deck.archived ? "Unarchive deck" : "Archive deck"}
          >
            {deck.archived ? (
              <ArchiveRestore className="size-4" />
            ) : (
              <Archive className="size-4" />
            )}
          </Button>
        </div>

        <Card>
          <div className="px-4 pt-4 pb-4">
            <div className="flex flex-col gap-2 mb-4">
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
                  className="border rounded px-2 py-1 w-full min-h-[80px] text-sm text-neutral-500 mb-3"
                  autoFocus
                />
              ) : (
                <p
                  className="text-sm text-neutral-500 mb-3 cursor-pointer dark:text-neutral-400"
                  onClick={() => setEditingDescription(true)}
                >
                  {description || "Click to add description"}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
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
              <Button
                type="button"
                variant="outline"
                onClick={handleGenerate}
                disabled={generating}
                className="w-full sm:w-auto"
              >
                {generating ? "Generating..." : "Generate Flashcards"}
              </Button>
            </div>
          </div>
        </Card>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Flashcards</h2>
          {flashcards.length === 0 ? (
            <p className="text-muted-foreground text-sm">No flashcards yet.</p>
          ) : (
            <div className="space-y-3">
              {flashcards.map((card) => (
                <div
                  key={card.id}
                  className="rounded-xl border border-neutral-200 px-4 py-3 flex items-start justify-between gap-3 bg-white dark:bg-neutral-900 dark:border-neutral-700"
                >
                  <Link
                    href={`/decks/${params.id}/edit-card/${card.id}`}
                    className="flex-1 min-w-0"
                  >
                    <div className="flex flex-col gap-1 text-start">
                      <div dir="auto" className="font-medium text-base leading-snug">
                        {card.question}
                      </div>
                      <div dir="auto" className="text-sm text-neutral-500 leading-snug dark:text-neutral-400">
                        {card.answer_short}
                      </div>
                    </div>
                  </Link>
                  <Link
                    href={`/decks/${params.id}/edit-card/${card.id}`}
                    className="flex-shrink-0 mt-1"
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Edit card"
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
