"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getDeck,
  getFlashcards,
  generateFlashcards,
  updateDeck,
  deleteDeck,
  deleteFlashcard,
} from "@/lib/api";
import PageContainer from "@/components/layout/page-container";

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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deckDeleteConfirm, setDeckDeleteConfirm] = useState(false);
  const [genTopic, setGenTopic] = useState("");
  const [genText, setGenText] = useState("");
  const GEN_TEXT_MAX_LENGTH = 10000;

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
    const topicTrimmed = genTopic.trim();
    const textTrimmed = genText.trim();
    const topicToUse = topicTrimmed || deck.name || "";
    if (!topicToUse && !textTrimmed) return;
    setGenerating(true);
    try {
      if (topicToUse) {
        await generateFlashcards({
          deck_id: deck.id,
          topic: topicToUse,
          num_cards: 10,
          language: "en",
        });
      }
      if (textTrimmed) {
        await generateFlashcards({
          deck_id: deck.id,
          text: textTrimmed,
          num_cards: 10,
          language: "en",
        });
      }
      setGenTopic("");
      setGenText("");
      const data = await getFlashcards(params.id);
      setFlashcards(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteCard(cardId: string) {
    try {
      await deleteFlashcard(cardId);
      const data = await getFlashcards(params.id);
      setFlashcards(Array.isArray(data) ? data : []);
      setDeleteConfirmId(null);
    } catch {
      // ignore
    }
  }

  async function handleDeleteDeck() {
    if (!deck) return;
    try {
      await deleteDeck(deck.id);
      router.push("/decks");
    } catch {
      // ignore
    } finally {
      setDeckDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Loading deck...</p>
      </PageContainer>
    );
  }

  if (notFound || !deck) {
    return (
      <PageContainer>
          <Link
            href="/decks"
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
          >
            ← Back
          </Link>
          <p className="text-muted-foreground">Deck not found.</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
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
            </div>
            <div className="generate-box mt-4 pt-4 border-t border-border space-y-3 max-mobile:p-3.5 max-mobile:rounded-[12px]">
              <p className="text-sm font-medium max-mobile:text-[15px] max-mobile:font-semibold">Generate flashcards</p>
              <p className="text-xs text-muted-foreground max-mobile:text-[13px] max-mobile:text-[#777] dark:max-mobile:text-neutral-400">
                Add AI-generated cards from topic, text, or both.
              </p>
              <div className="space-y-2">
                <Input
                  placeholder="Topic (e.g. Spanish vocabulary)"
                  value={genTopic}
                  onChange={(e) => setGenTopic(e.target.value)}
                  className="w-full"
                />
                <textarea
                  placeholder="Or paste text to generate from..."
                  value={genText}
                  onChange={(e) => setGenText(e.target.value)}
                  maxLength={GEN_TEXT_MAX_LENGTH}
                  className="w-full min-h-[100px] max-mobile:min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    {genText.length} / {GEN_TEXT_MAX_LENGTH} characters
                  </span>
                  {genText.length >= GEN_TEXT_MAX_LENGTH && (
                    <span className="text-xs text-destructive">Text is too long</span>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleGenerate}
                disabled={
                  generating ||
                  genText.length > GEN_TEXT_MAX_LENGTH
                }
                className="w-full sm:w-auto"
              >
                {generating ? "Generating..." : "Generate"}
              </Button>
            </div>
          </div>
        </Card>

        <section className="section space-y-4">
          <h2 className="text-lg font-semibold">Flashcards</h2>
          {flashcards.length === 0 ? (
            <p className="text-muted-foreground text-sm">No flashcards yet.</p>
          ) : (
            <div className="space-y-3 max-mobile:space-y-2.5">
              {flashcards.map((card) => (
                <div
                  key={card.id}
                  className="flashcard-item rounded-xl border border-neutral-200 px-4 py-3 flex items-start justify-between gap-3 bg-white dark:bg-neutral-900 dark:border-neutral-700 max-mobile:p-3.5 max-mobile:rounded-[12px]"
                >
                  <Link
                    href={`/decks/${params.id}/edit-card/${card.id}`}
                    className="flex-1 min-w-0"
                  >
                    <div className="flex flex-col gap-1 text-start">
                      <div dir="auto" className="font-medium text-base leading-snug max-mobile:text-[15px] max-mobile:leading-[1.4]">
                        {card.question}
                      </div>
                      <div dir="auto" className="text-sm text-neutral-500 leading-snug dark:text-neutral-400 max-mobile:text-[14px] max-mobile:text-[#555] dark:max-mobile:text-neutral-400">
                        {card.answer_short}
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center gap-1 flex-shrink-0 mt-1 [&_svg]:max-mobile:!size-4">
                    <Link
                      href={`/decks/${params.id}/edit-card/${card.id}`}
                      className="inline-flex"
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteConfirmId(card.id);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Delete card"
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="section space-y-4 pt-8 border-t border-border">
          <h2 className="text-lg font-semibold">Danger Zone</h2>
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="font-medium mb-1">Delete deck</p>
            <p className="text-sm text-muted-foreground mb-3">
              This will permanently delete the deck and all flashcards.
            </p>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeckDeleteConfirm(true)}
            >
              Delete Deck
            </Button>
          </div>
        </section>

        {deleteConfirmId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setDeleteConfirmId(null)}
          >
            <div
              className="bg-background rounded-lg shadow-lg p-6 w-full max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-4">Delete this card?</h2>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteConfirmId(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteConfirmId && handleDeleteCard(deleteConfirmId)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}

        {deckDeleteConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setDeckDeleteConfirm(false)}
          >
            <div
              className="bg-background rounded-lg shadow-lg p-6 w-full max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-2">Delete this deck?</h2>
              <p className="text-sm text-muted-foreground mb-4">
                This will permanently delete:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside mb-4 space-y-1">
                <li>the deck</li>
                <li>all flashcards inside it</li>
              </ul>
              <p className="text-sm text-muted-foreground mb-4">
                This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeckDeleteConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteDeck}
                >
                  Delete Deck
                </Button>
              </div>
            </div>
          </div>
        )}
    </PageContainer>
  );
}
