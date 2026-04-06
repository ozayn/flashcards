"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildYoutubeDeckSourceMetadata,
  createDeck,
  fetchWebpageContent,
  fetchYouTubeTranscript,
  generateFlashcardsBackground,
  getUsers,
  isYouTubePlaylistUrl,
  normalizeYouTubeUrl,
  TranscriptFetchError,
} from "@/lib/api";
import { getStoredUserId } from "@/components/user-selector";
import { GenerationLanguageToggle } from "@/components/generation-language-toggle";
import {
  generationLanguagePayload,
  normalizeLangCode,
  originalLanguageToggleLabel,
  transcriptLanguageDisplay,
  type GenerationLangPreference,
} from "@/lib/source-language";
import { startYoutubeTranscriptPhaseTimers } from "@/lib/youtube-fetch-status";

const YT_REGEX = /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)/i;

function isYouTubeUrl(s: string): boolean {
  return YT_REGEX.test(s.trim());
}

function isWikipediaUrl(s: string): boolean {
  return /^https?:\/\/([a-z]{2,3}\.)?wikipedia\.org\/wiki\//i.test(s.trim());
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
  const [ytFallback, setYtFallback] = useState<{
    url: string;
    title?: string;
    watchMetadataOk?: boolean;
    code?: string | null;
  } | null>(null);
  const [genLangMode, setGenLangMode] = useState<GenerationLangPreference>("source");
  /** Set after a successful YouTube transcript fetch (same submit); pairs with language toggle. */
  const [youtubeTranscriptLangRaw, setYoutubeTranscriptLangRaw] = useState<string | null>(null);

  const trimmed = value.trim();
  const isYT = isYouTubeUrl(trimmed);
  const isWiki = !isYT && isWikipediaUrl(trimmed);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || loading) return;
    setError(null);
    setYtFallback(null);
    setLoading(true);
    setLoadingMessage("");
    setYoutubeTranscriptLangRaw(null);

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
        if (isYouTubePlaylistUrl(trimmed)) {
          setError("YouTube playlists aren\u2019t supported yet. Please paste a single video link.");
          setLoading(false);
          return;
        }
        const cleanYtUrl = normalizeYouTubeUrl(trimmed);
        const stopYtPhases = startYoutubeTranscriptPhaseTimers(setLoadingMessage);
        let transcript: Awaited<ReturnType<typeof fetchYouTubeTranscript>>;
        try {
          transcript = await fetchYouTubeTranscript(cleanYtUrl);
        } catch (err) {
          const tfe = err instanceof TranscriptFetchError ? err : null;
          setYtFallback({
            url: cleanYtUrl,
            title: tfe?.title || undefined,
            watchMetadataOk: Boolean(tfe?.watchMetadataOk),
            code: tfe?.code ?? undefined,
          });
          setLoading(false);
          setLoadingMessage("");
          return;
        } finally {
          stopYtPhases();
        }

        const langRaw = transcript.language?.trim() || null;
        setYoutubeTranscriptLangRaw(langRaw);

        const videoTitle = transcript.title || null;
        const deckName = videoTitle || "YouTube Deck";
        setLoadingMessage("Preparing deck…");
        const deck = await createDeck({
          user_id: userId,
          name: deckName,
          source_type: "youtube",
          source_url: cleanYtUrl,
          source_text: transcript.transcript,
          source_topic: videoTitle,
          source_segments: transcript.segments?.length ? JSON.stringify(transcript.segments) : undefined,
          source_metadata: buildYoutubeDeckSourceMetadata(transcript),
        });
        const deckId = (deck as { id: string }).id;

        await generateFlashcardsBackground({
          deck_id: deckId,
          text: transcript.transcript.slice(0, 50000),
          num_cards: 10,
          ...generationLanguagePayload(genLangMode, normalizeLangCode(transcript.language)),
          youtube_route_reason: "youtube_transcript",
        }).catch(() => {});

        router.push(`/decks/${deckId}`);
      } else if (isWiki) {
        setLoadingMessage("Fetching article…");
        let article: Awaited<ReturnType<typeof fetchWebpageContent>>;
        try {
          article = await fetchWebpageContent(trimmed);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to fetch article.");
          setLoading(false);
          setLoadingMessage("");
          return;
        }

        const articleTitle = article.title || null;
        const deckName = articleTitle || "Wikipedia Deck";
        setLoadingMessage("Creating deck…");
        const deck = await createDeck({
          user_id: userId,
          name: deckName,
          source_type: "wikipedia",
          source_url: trimmed,
          source_text: article.text,
          source_topic: articleTitle,
        });
        const deckId = (deck as { id: string }).id;

        await generateFlashcardsBackground({
          deck_id: deckId,
          text: article.text.slice(0, 50000),
          num_cards: 10,
          ...generationLanguagePayload(genLangMode, null),
        }).catch(() => {});

        router.push(`/decks/${deckId}`);
      } else {
        if (isYouTubePlaylistUrl(trimmed)) {
          setError("YouTube playlists aren\u2019t supported yet. Please paste a single video link.");
          setLoading(false);
          return;
        }
        if (looksLikeUrl(trimmed)) {
          setError("That looks like a URL. Only YouTube and Wikipedia links are supported for now.");
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

        await generateFlashcardsBackground({
          deck_id: deckId,
          topic: trimmed,
          num_cards: 10,
          ...generationLanguagePayload(genLangMode, null),
        }).catch(() => {});

        router.push(`/decks/${deckId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create deck. Please try again.");
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const fallbackUrl = ytFallback
    ? `/create-deck?mode=text&youtube=${encodeURIComponent(ytFallback.url)}${ytFallback.title ? `&title=${encodeURIComponent(ytFallback.title)}` : ""}`
    : null;

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl mx-auto space-y-3">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
          setYtFallback(null);
          setYoutubeTranscriptLangRaw(null);
        }}
        placeholder={placeholder}
        autoComplete="off"
        disabled={loading}
        className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-60"
      />
      {suggestions.length > 0 && !loading && !isYT && !isWiki && !ytFallback && (
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
      {error && !ytFallback && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}
      {ytFallback && (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-4 space-y-3 text-center">
          <p className="text-sm text-foreground">
            {ytFallback.code === "TRANSCRIPT_TOO_SHORT"
              ? "The transcript was too short to use automatically."
              : ytFallback.watchMetadataOk
                ? "Video found, but the transcript could not be retrieved."
                : "We couldn\u2019t fetch the transcript from YouTube right now."}
          </p>
          {ytFallback.title && ytFallback.code !== "TRANSCRIPT_TOO_SHORT" ? (
            <p className="text-sm text-muted-foreground line-clamp-2">{ytFallback.title}</p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            You can still create the deck by pasting the transcript or notes yourself.
          </p>
          <Link
            href={fallbackUrl!}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-5 text-sm font-medium"
          >
            Paste transcript instead
          </Link>
        </div>
      )}
      {!ytFallback && (
        <div className="flex flex-col items-center gap-2">
          <GenerationLanguageToggle
            value={genLangMode}
            onChange={setGenLangMode}
            sourceLabel={originalLanguageToggleLabel(isYT ? youtubeTranscriptLangRaw : null)}
            disabled={loading}
          />
          {isYT && youtubeTranscriptLangRaw ? (
            <p className="text-xs text-muted-foreground text-center max-w-md mx-auto leading-snug">
              Transcript language: {transcriptLanguageDisplay(youtubeTranscriptLangRaw)}
            </p>
          ) : null}
          <Button
            type="submit"
            size="lg"
            disabled={!trimmed || loading}
            className="rounded-xl px-8 font-medium"
          >
            {loading
              ? "Working…"
              : isYT
                ? "Create Deck from Video"
                : isWiki
                  ? "Create Deck from Article"
                  : "Create Deck"}
          </Button>
          {loading && loadingMessage ? (
            <p
              className="text-sm text-muted-foreground text-center max-w-md mx-auto leading-snug"
              role="status"
              aria-live="polite"
            >
              {loadingMessage}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {isYT
              ? "We\u2019ll pull the transcript and create a deck from it."
              : isWiki
                ? "We\u2019ll extract the article and create a deck from it."
                : "We\u2019ll generate flashcards and open your new deck."}
          </p>
        </div>
      )}
    </form>
  );
}
