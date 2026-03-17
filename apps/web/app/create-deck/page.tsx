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

function CreateDeckForm() {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [cardCount, setCardCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const topicParam = searchParams.get("topic");
    if (topicParam) {
      setTopic(topicParam);
      setName((n) => (n ? n : topicParam));
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    setLoading(true);

    try {
      const deck = await createDeck({
        user_id: userId,
        name,
        source_type: "manual",
      });
      const deckId = (deck as { id: string }).id;

      const topicTrimmed = topic.trim();
      const textTrimmed = text.trim();

      // Text mode takes precedence: when user pastes text, generate only from that text.
      // Do not use deck name as topic fallback—that would inject generic cards.
      if (textTrimmed) {
        await generateFlashcards({
          deck_id: deckId,
          text: textTrimmed,
          num_cards: cardCount,
          language: "en",
        });
      } else if (topicTrimmed || name) {
        await generateFlashcards({
          deck_id: deckId,
          topic: topicTrimmed || name,
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
              Create a new flashcard deck
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Deck Name
                </label>
                <Input
                  id="name"
                  placeholder="e.g. Spanish Vocabulary"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>

              <div className="space-y-4">
                <p className="text-sm font-medium">Add cards automatically (optional)</p>
                <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 items-end">
                  <label htmlFor="topic" className="text-sm font-medium">
                    Generate cards about
                  </label>
                  <label htmlFor="cardCount" className="text-sm font-medium">
                    Number of cards
                  </label>
                  <Input
                    id="topic"
                    placeholder="Leave blank to use the deck name"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="min-w-0"
                  />
                  <select
                    id="cardCount"
                    value={cardCount}
                    onChange={(e) => setCardCount(Number(e.target.value))}
                    className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-[80px]"
                  >
                    {CARD_COUNT_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="text" className="text-sm font-medium">
                    From text
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
                      <span className="text-xs text-destructive">Text is too long</span>
                    )}
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                {loading ? "Creating..." : "Create Deck"}
              </Button>
            </form>
          </CardContent>
        </Card>
    </PageContainer>
  );
}

export default function CreateDeckPage() {
  return (
    <Suspense fallback={
      <PageContainer>
        <p className="text-muted-foreground">Loading...</p>
      </PageContainer>
    }>
      <CreateDeckForm />
    </Suspense>
  );
}
