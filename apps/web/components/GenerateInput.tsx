"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createDeck, generateFlashcards, fetchYouTubeTranscript, getUsers } from "@/lib/api";
import { getStoredUserId } from "@/components/user-selector";

const YT_REGEX = /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)/i;

function isYouTubeUrl(s: string): boolean {
  return YT_REGEX.test(s.trim());
}

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim()) || /^www\./i.test(s.trim());
}

interface GenerateInputProps {
  placeholder?: string;
  suggestions?: string[];
}

export function GenerateInput({
  placeholder = "Enter a topic or paste a YouTube link…",
  suggestions = [],
}: GenerateInputProps) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const trimmed = value.trim();
  const isYT = isYouTubeUrl(trimmed);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || loading) return;
    setError(null);
    setLoading(true);

    try {
      let userId: string | null = getStoredUserId();
      if (!userId) {
        const users = await getUsers();
        if (Array.isArray(users) && users.length > 0) {
          userId = users[0].id;
        }
      }
      if (!userId) {
        setError("No user found. Please select a user first.");
        setLoading(false);
        return;
      }

      if (isYT) {
        setLoadingMessage("Fetching transcript…");
        let transcript: Awaited<ReturnType<typeof fetchYouTubeTranscript>>;
        try {
          transcript = await fetchYouTubeTranscript(trimmed);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to fetch transcript.");
          setLoading(false);
          setLoadingMessage("");
          return;
        }

        const videoTitle = transcript.title || null;
        const deckName = videoTitle || "YouTube Deck";
        setLoadingMessage("Creating deck…");
        const deck = await createDeck({
          user_id: userId,
          name: deckName,
          source_type: "youtube",
          source_url: trimmed,
          source_text: transcript.transcript.slice(0, 10000),
          source_topic: videoTitle,
        });
        const deckId = (deck as { id: string }).id;

        setLoadingMessage("Generating flashcards…");
        await generateFlashcards({
          deck_id: deckId,
          text: transcript.transcript.slice(0, 10000),
          num_cards: 10,
          language: transcript.language || "en",
        });

        router.push(`/decks/${deckId}`);
      } else {
        if (looksLikeUrl(trimmed)) {
          setError("That looks like a URL. Only YouTube links are supported for now.");
          setLoading(false);
          return;
        }
        setLoadingMessage("Creating deck…");
        const deck = await createDeck({
          user_id: userId,
          name: trimmed,
          source_type: "topic",
          source_topic: trimmed,
        });
        const deckId = (deck as { id: string }).id;

        setLoadingMessage("Generating flashcards…");
        await generateFlashcards({
          deck_id: deckId,
          topic: trimmed,
          num_cards: 10,
          language: "en",
        });

        router.push(`/decks/${deckId}`);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
      setLoadingMessage("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl mx-auto space-y-4">
      <input
        type="text"
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(null); }}
        placeholder={placeholder}
        autoComplete="off"
        disabled={loading}
        className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-60"
      />
      {suggestions.length > 0 && !loading && !isYT && (
        <div className="flex flex-wrap gap-2 justify-center">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setValue(s)}
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}
      <div className="flex flex-col items-center gap-2">
        <Button
          type="submit"
          size="lg"
          disabled={!trimmed || loading}
          className="rounded-xl px-8 font-medium"
        >
          {loading
            ? loadingMessage || "Creating…"
            : isYT
              ? "Create Deck from Video"
              : "Create Deck"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {isYT
            ? "We\u2019ll pull the transcript and create a deck from it."
            : "We\u2019ll generate flashcards and open your new deck."}
        </p>
      </div>
    </form>
  );
}
