"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getUsers, createDeck, generateFlashcards } from "@/lib/api";
import { getStoredUserId } from "@/components/user-selector";
import PageContainer from "@/components/layout/page-container";

const CARD_COUNT_OPTIONS = [5, 10, 20, 30, 40, 50] as const;

type GenerationMode = "topic" | "text";

function CreateDeckForm() {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("topic");
  const [emptyDeckMode, setEmptyDeckMode] = useState(false);
  const [cardCount, setCardCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const topicParam = searchParams.get("topic");
    if (topicParam) {
      setTopic(topicParam);
      setGenerationMode("topic");
    }
  }, [searchParams]);

  const nameTrimmed = name.trim();
  const topicTrimmed = topic.trim();
  const textTrimmed = text.trim();

  const willGenerate =
    !emptyDeckMode &&
    (generationMode === "topic"
      ? Boolean(topicTrimmed)
      : Boolean(textTrimmed));

  const submitLabel = loading
    ? "Creating..."
    : emptyDeckMode
      ? "Create Empty Deck"
      : willGenerate
        ? "Create Deck and Generate Cards"
        : "Create Deck";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (emptyDeckMode) {
      if (!nameTrimmed) {
        alert("Enter a deck name for your empty deck.");
        return;
      }
    } else if (generationMode === "topic") {
      if (!nameTrimmed && !topicTrimmed) {
        alert("Enter a deck name or a topic to continue.");
        return;
      }
    } else {
      if (!nameTrimmed && !textTrimmed) {
        alert("Enter a deck name or paste notes to continue.");
        return;
      }
      if (textTrimmed && !nameTrimmed) {
        alert("Please enter a deck name when generating from pasted text.");
        return;
      }
    }

    let userId: string | null = getStoredUserId();
    if (!userId) {
      const users = await getUsers();
      if (Array.isArray(users) && users.length > 0) {
        userId = users[0].id;
      } else {
        alert("No user found. Please refresh the page.");
        return;
      }
    }
    if (!userId) return;

    const effectiveDeckName =
      emptyDeckMode || generationMode === "text"
        ? nameTrimmed
        : nameTrimmed || topicTrimmed;

    setLoading(true);

    try {
      if (emptyDeckMode) {
        const deck = await createDeck({
          user_id: userId,
          name: effectiveDeckName,
          source_type: "manual",
        });
        const deckId = (deck as { id: string }).id;
        router.push(`/decks/${deckId}`);
        return;
      }

      const deck = await createDeck({
        user_id: userId,
        name: effectiveDeckName,
        source_type:
          generationMode === "text"
            ? "text"
            : topicTrimmed
              ? "topic"
              : "manual",
        source_topic:
          generationMode === "topic" && topicTrimmed ? topicTrimmed : undefined,
      });
      const deckId = (deck as { id: string }).id;

      if (generationMode === "text" && textTrimmed) {
        await generateFlashcards({
          deck_id: deckId,
          text: textTrimmed,
          num_cards: cardCount,
          language: "en",
        });
      } else if (generationMode === "topic" && topicTrimmed) {
        await generateFlashcards({
          deck_id: deckId,
          topic: topicTrimmed,
          num_cards: cardCount,
          language: "en",
        });
      }

      router.push(`/decks/${deckId}`);
    } catch {
      alert("Failed to create deck");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer>
      <div className="flex items-center gap-4">
        <Link
          href="/decks"
          className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
        >
          ← Back
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Create Deck</CardTitle>
          <CardDescription>
            Create a deck and optionally generate cards from a topic or text.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          <form onSubmit={handleSubmit} className="space-y-0">
            <section className="space-y-3 pb-8">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Deck details
              </h2>
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Deck Name
                </label>
                <Input
                  id="name"
                  placeholder="e.g. Spanish Vocabulary"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {emptyDeckMode
                    ? "Required for an empty deck."
                    : "Optional. If left blank, the topic will be used as the deck name."}
                </p>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={emptyDeckMode}
                  onChange={(e) => {
                    setEmptyDeckMode(e.target.checked);
                  }}
                  className="mt-0.5 rounded border-input"
                />
                <span>
                  <span className="font-medium text-foreground">
                    Create empty deck (no cards)
                  </span>
                  <span className="block text-muted-foreground text-xs mt-1 leading-relaxed">
                    Skip adding cards now. You can add them later.
                  </span>
                </span>
              </label>
            </section>

            {!emptyDeckMode && (
              <>
                <div className="border-t border-border/40" aria-hidden />

                <section className="space-y-4 pt-8">
                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold tracking-tight text-foreground">
                      Add cards
                    </h2>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Choose Topic or Text, then fill in the fields below. Cards are
                      generated after the deck is created.
                    </p>
                  </div>

                  <div
                    className="inline-flex rounded-lg border border-border/50 bg-muted/30 p-0.5"
                    role="radiogroup"
                    aria-label="Generation source"
                  >
                    {(
                      [
                        { value: "topic" as const, label: "Topic" },
                        { value: "text" as const, label: "Text" },
                      ] as const
                    ).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={generationMode === value}
                        onClick={() => setGenerationMode(value)}
                        className={`min-w-[5.5rem] rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                          generationMode === value
                            ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {generationMode === "topic" && (
                    <div className="space-y-3 pt-1">
                      <div className="space-y-2">
                        <label htmlFor="topic" className="text-sm font-medium">
                          Topic
                        </label>
                        <Input
                          id="topic"
                          placeholder="e.g. Photosynthesis, Spanish verbs"
                          value={topic}
                          onChange={(e) => setTopic(e.target.value)}
                          className="min-w-0"
                        />
                        <p className="text-xs text-muted-foreground">
                          Use a short topic or concept. Saved for later reference and
                          regeneration.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <label
                          htmlFor="cardCount-topic"
                          className="text-sm font-medium shrink-0"
                        >
                          Number of cards
                        </label>
                        <select
                          id="cardCount-topic"
                          value={cardCount}
                          onChange={(e) => setCardCount(Number(e.target.value))}
                          className="h-9 min-w-[4.5rem] rounded-md border border-input bg-background px-2.5 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {CARD_COUNT_OPTIONS.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {generationMode === "text" && (
                    <div className="space-y-3 pt-1">
                      <div className="space-y-2">
                        <label htmlFor="text" className="text-sm font-medium">
                          Paste notes or transcript
                        </label>
                        <textarea
                          id="text"
                          placeholder="Paste notes or text to generate flashcards..."
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          maxLength={10000}
                          className="w-full min-h-[160px] max-mobile:min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">
                            {text.length} / 10000 characters
                          </span>
                          {text.length >= 10000 && (
                            <span className="text-xs text-destructive">
                              Text is too long
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <label
                          htmlFor="cardCount-text"
                          className="text-sm font-medium shrink-0"
                        >
                          Number of cards
                        </label>
                        <select
                          id="cardCount-text"
                          value={cardCount}
                          onChange={(e) => setCardCount(Number(e.target.value))}
                          className="h-9 min-w-[4.5rem] rounded-md border border-input bg-background px-2.5 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {CARD_COUNT_OPTIONS.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}

            <div className="mt-8 border-t border-border/40 pt-5">
              <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                {submitLabel}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

export default function CreateDeckPage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <p className="text-muted-foreground">Loading...</p>
        </PageContainer>
      }
    >
      <CreateDeckForm />
    </Suspense>
  );
}
