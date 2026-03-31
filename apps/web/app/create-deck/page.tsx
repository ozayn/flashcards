"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getUsers, createDeck, generateFlashcards, importFlashcards, parseQAPairs, fetchYouTubeTranscript, fetchWebpageContent, normalizeYouTubeUrl, TranscriptFetchError } from "@/lib/api";
import { getStoredUserId } from "@/components/user-selector";
import { Upload } from "lucide-react";
import PageContainer from "@/components/layout/page-container";

const CARD_COUNT_OPTIONS = [5, 10, 20, 30, 40, 50] as const;

type GenerationMode = "topic" | "text" | "youtube" | "url" | "import";

const _YT_RE = /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)/i;
const _WIKI_RE = /^https?:\/\/([a-z]{2,3}\.)?wikipedia\.org\/wiki\//i;

function _detectUrlMode(val: string): "youtube" | "url" | null {
  const t = val.trim();
  if (_YT_RE.test(t)) return "youtube";
  if (_WIKI_RE.test(t)) return "url";
  return null;
}

function CreateDeckForm() {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [articleUrl, setArticleUrl] = useState("");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("topic");
  const [emptyDeckMode, setEmptyDeckMode] = useState(false);
  const [useNameAsTopic, setUseNameAsTopic] = useState(false);
  const [cardCount, setCardCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [autoSwitchHint, setAutoSwitchHint] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [ytFallbackUrl, setYtFallbackUrl] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const modeParam = searchParams.get("mode");
    const topicParam = searchParams.get("topic");
    const ytParam = searchParams.get("youtube");
    const titleParam = searchParams.get("title");

    if (modeParam === "text" && ytParam) {
      setGenerationMode("text");
      setYtFallbackUrl(ytParam);
      if (titleParam) setName(titleParam);
    } else if (topicParam) {
      setTopic(topicParam);
      setGenerationMode("topic");
    } else if (ytParam) {
      setYoutubeUrl(ytParam);
      setGenerationMode("youtube");
    }
  }, [searchParams]);

  const nameTrimmed = name.trim();
  const topicTrimmed = topic.trim();
  const textTrimmed = text.trim();
  const youtubeUrlTrimmed = youtubeUrl.trim();
  const articleUrlTrimmed = articleUrl.trim();

  const importTextTrimmed = importText.trim();
  const importQAPairs = generationMode === "import" ? parseQAPairs(importTextTrimmed) : null;

  const topicForGeneration =
    topicTrimmed || (useNameAsTopic && !topicTrimmed ? nameTrimmed : "");

  const willGenerate =
    !emptyDeckMode &&
    (generationMode === "topic"
      ? Boolean(topicForGeneration)
      : generationMode === "text"
        ? Boolean(textTrimmed)
        : generationMode === "url"
          ? Boolean(articleUrlTrimmed)
          : generationMode === "import"
            ? Boolean(importQAPairs && importQAPairs.length > 0)
            : Boolean(youtubeUrlTrimmed));

  const submitLabel = loading
    ? loadingMessage || "Creating..."
    : emptyDeckMode
      ? "Create Empty Deck"
      : generationMode === "import" && importQAPairs && importQAPairs.length > 0
        ? `Create Deck and Import ${importQAPairs.length} Cards`
        : generationMode === "youtube" && youtubeUrlTrimmed
          ? "Create Deck from Video"
          : generationMode === "url" && articleUrlTrimmed
            ? "Create Deck from Article"
            : willGenerate
              ? "Create Deck and Generate Cards"
              : "Create Deck";

  function handleImportFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    if (!file.name.endsWith(".txt") && file.type !== "text/plain") {
      setImportError("Only .txt files are supported.");
      return;
    }
    if (file.size > 500_000) {
      setImportError("File is too large (max 500 KB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setImportText(text);
      if (importFileRef.current) importFileRef.current.value = "";
      const pairs = parseQAPairs(text.trim());
      if (!pairs) {
        setImportError("No valid Q:/A: pairs found in the file. Each card needs a Q: and A: line.");
      }
    };
    reader.readAsText(file);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (emptyDeckMode) {
      if (!nameTrimmed) {
        setFormError("Enter a deck name for your empty deck.");
        return;
      }
    } else if (generationMode === "import") {
      if (!nameTrimmed) {
        setFormError("Please enter a deck name for the imported cards.");
        return;
      }
      if (!importQAPairs || importQAPairs.length === 0) {
        setFormError("No valid Q:/A: pairs found. Paste or upload Q/A content first.");
        return;
      }
    } else if (generationMode === "url") {
      if (!articleUrlTrimmed) {
        setFormError("Paste a Wikipedia URL to continue.");
        return;
      }
    } else if (generationMode === "youtube") {
      if (!youtubeUrlTrimmed) {
        setFormError("Paste a YouTube link to continue.");
        return;
      }
    } else if (generationMode === "topic") {
      if (!nameTrimmed && !topicTrimmed) {
        setFormError("Enter a deck name or a topic to continue.");
        return;
      }
    } else {
      if (!nameTrimmed && !textTrimmed) {
        setFormError("Enter a deck name or paste notes to continue.");
        return;
      }
      if (textTrimmed && !nameTrimmed) {
        setFormError("Please enter a deck name when generating from pasted text.");
        return;
      }
    }

    let userId: string | null = getStoredUserId();
    if (!userId) {
      const users = await getUsers();
      if (Array.isArray(users) && users.length > 0) {
        userId = users[0].id;
      } else {
        setFormError("No user found. Please refresh the page.");
        return;
      }
    }
    if (!userId) return;

    setLoading(true);

    try {
      if (emptyDeckMode) {
        const deck = await createDeck({
          user_id: userId,
          name: nameTrimmed,
          source_type: "manual",
        });
        const deckId = (deck as { id: string }).id;
        router.push(`/decks/${deckId}`);
        return;
      }

      if (generationMode === "import" && importQAPairs) {
        setLoadingMessage("Creating deck…");
        const deck = await createDeck({
          user_id: userId,
          name: nameTrimmed,
          source_type: "text",
        });
        const deckId = (deck as { id: string }).id;
        setLoadingMessage(`Importing ${importQAPairs.length} cards…`);
        try {
          await importFlashcards({ deck_id: deckId, cards: importQAPairs });
        } catch {
          router.push(`/decks/${deckId}`);
          return;
        }
        router.push(`/decks/${deckId}`);
        return;
      }

      if (generationMode === "youtube") {
        const cleanYtUrl = normalizeYouTubeUrl(youtubeUrlTrimmed);
        setLoadingMessage("Fetching transcript…");
        let transcript: Awaited<ReturnType<typeof fetchYouTubeTranscript>>;
        try {
          transcript = await fetchYouTubeTranscript(cleanYtUrl);
        } catch (err) {
          setYtFallbackUrl(cleanYtUrl);
          setGenerationMode("text");
          if (err instanceof TranscriptFetchError && err.title) {
            if (!nameTrimmed) setName(err.title);
          }
          setFormError("We couldn\u2019t fetch the transcript. You can paste it manually below.");
          setLoading(false);
          setLoadingMessage("");
          return;
        }

        const videoTitle = transcript.title || null;
        const deckName = nameTrimmed || videoTitle || "YouTube Deck";
        setLoadingMessage("Creating deck…");

        const deck = await createDeck({
          user_id: userId,
          name: deckName,
          source_type: "youtube",
          source_url: cleanYtUrl,
          source_text: transcript.transcript,
          source_topic: videoTitle,
        });
        const deckId = (deck as { id: string }).id;

        setLoadingMessage("Generating flashcards… this may take a minute");
        try {
          await generateFlashcards({
            deck_id: deckId,
            text: transcript.transcript.slice(0, 50000),
            num_cards: cardCount,
            language: transcript.language || "en",
          });
        } catch {
          router.push(`/decks/${deckId}`);
          return;
        }

        router.push(`/decks/${deckId}`);
        return;
      }

      if (generationMode === "url") {
        setLoadingMessage("Fetching article…");
        let article: Awaited<ReturnType<typeof fetchWebpageContent>>;
        try {
          article = await fetchWebpageContent(articleUrlTrimmed);
        } catch (err) {
          setFormError(err instanceof Error ? err.message : "Failed to fetch the article.");
          setLoading(false);
          setLoadingMessage("");
          return;
        }

        const articleTitle = article.title || null;
        const deckName = nameTrimmed || articleTitle || "Wikipedia Deck";
        setLoadingMessage("Creating deck…");

        const deck = await createDeck({
          user_id: userId,
          name: deckName,
          source_type: "wikipedia",
          source_url: articleUrlTrimmed,
          source_text: article.text,
          source_topic: articleTitle,
        });
        const deckId = (deck as { id: string }).id;

        setLoadingMessage("Generating flashcards… this may take a minute");
        try {
          await generateFlashcards({
            deck_id: deckId,
            text: article.text.slice(0, 50000),
            num_cards: cardCount,
          });
        } catch {
          router.push(`/decks/${deckId}`);
          return;
        }

        router.push(`/decks/${deckId}`);
        return;
      }

      const effectiveDeckName =
        generationMode === "text"
          ? nameTrimmed
          : nameTrimmed || topicTrimmed;

      const effectiveTopic =
        generationMode === "topic" ? topicForGeneration : "";

      setLoadingMessage("Creating deck…");
      const deck = await createDeck({
        user_id: userId,
        name: effectiveDeckName,
        source_type:
          generationMode === "text"
            ? "text"
            : effectiveTopic
              ? "topic"
              : "manual",
        source_topic:
          generationMode === "topic" && effectiveTopic ? effectiveTopic : undefined,
      });
      const deckId = (deck as { id: string }).id;

      if (generationMode === "text" && textTrimmed) {
        setLoadingMessage("Generating flashcards… this may take a minute");
        try {
          await generateFlashcards({
            deck_id: deckId,
            text: textTrimmed,
            num_cards: cardCount,
            language: "en",
          });
        } catch {
          router.push(`/decks/${deckId}`);
          return;
        }
      } else if (generationMode === "topic" && effectiveTopic) {
        setLoadingMessage("Generating flashcards… this may take a minute");
        try {
          await generateFlashcards({
            deck_id: deckId,
            topic: effectiveTopic,
            num_cards: cardCount,
            language: "en",
          });
        } catch {
          router.push(`/decks/${deckId}`);
          return;
        }
      }

      router.push(`/decks/${deckId}`);
    } catch {
      setFormError("Failed to create deck. Please try again.");
    } finally {
      setLoading(false);
      setLoadingMessage("");
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create Deck</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a deck and optionally generate cards with AI.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            Deck Name
          </label>
          <Input
            id="name"
            placeholder={generationMode === "youtube" ? "Auto-filled from video title if empty" : generationMode === "url" ? "Auto-filled from article title if empty" : generationMode === "import" ? "e.g. Biology Final Exam" : "e.g. Spanish Vocabulary"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            disabled={loading}
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={emptyDeckMode}
            onChange={(e) => {
              setEmptyDeckMode(e.target.checked);
            }}
            className="rounded border-input"
            disabled={loading}
          />
          <span className="text-muted-foreground">
            Create empty deck (add cards later)
          </span>
        </label>

        {!emptyDeckMode && (
          <section className="space-y-4 pt-2 border-t border-border/40">
            <h2 className="text-sm font-semibold tracking-tight text-foreground pt-4">
              Generate cards
            </h2>

                  <div
                    className="inline-flex rounded-lg border border-border/50 bg-muted/30 p-0.5"
                    role="radiogroup"
                    aria-label="Generation source"
                  >
                    {(
                      [
                        { value: "topic" as const, label: "Topic" },
                        { value: "text" as const, label: "Text" },
                        { value: "youtube" as const, label: "YouTube" },
                        { value: "url" as const, label: "URL" },
                        { value: "import" as const, label: "Import" },
                      ] as const
                    ).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={generationMode === value}
                        onClick={() => { setGenerationMode(value); setFormError(null); }}
                        disabled={loading}
                        className={`min-w-[5rem] rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                          generationMode === value
                            ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {autoSwitchHint && (
                    <p className="text-xs text-muted-foreground animate-in fade-in duration-200">
                      {autoSwitchHint}
                    </p>
                  )}

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
                          onChange={(e) => {
                            const v = e.target.value;
                            const detected = _detectUrlMode(v);
                            if (detected) {
                              setTopic("");
                              setFormError(null);
                              if (detected === "youtube") {
                                setYoutubeUrl(normalizeYouTubeUrl(v));
                                setGenerationMode("youtube");
                                setAutoSwitchHint("Moved to YouTube");
                              } else {
                                setArticleUrl(v.trim());
                                setGenerationMode("url");
                                setAutoSwitchHint("Moved to URL");
                              }
                              setTimeout(() => setAutoSwitchHint(null), 3000);
                            } else {
                              setTopic(v);
                              setAutoSwitchHint(null);
                            }
                          }}
                          className="min-w-0"
                          disabled={loading}
                        />
                        <p className="text-xs text-muted-foreground">
                          Leave empty to skip generation.
                        </p>
                      </div>
                      {!topicTrimmed && (
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={useNameAsTopic}
                            onChange={(e) => setUseNameAsTopic(e.target.checked)}
                            className="rounded border-input"
                            disabled={loading}
                          />
                          <span className="text-muted-foreground">
                            Use deck name as topic for generation
                          </span>
                        </label>
                      )}
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
                          disabled={loading}
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
                      {ytFallbackUrl && (
                        <div className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3 space-y-1.5">
                          <p className="text-sm font-medium text-foreground">
                            How to copy the transcript from YouTube
                          </p>
                          <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
                            <li>
                              Open the video on{" "}
                              <a
                                href={ytFallbackUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline underline-offset-2 hover:text-foreground"
                              >
                                YouTube
                              </a>
                            </li>
                            <li>Click <strong>⋯</strong> (more) below the video → <strong>Show transcript</strong></li>
                            <li>Select all the transcript text, copy, and paste below</li>
                          </ol>
                        </div>
                      )}
                      <div className="space-y-2">
                        <label htmlFor="text" className="text-sm font-medium">
                          Paste notes or transcript
                        </label>
                        <textarea
                          id="text"
                          placeholder={ytFallbackUrl ? "Paste the YouTube transcript here…" : "Paste notes, lecture content, or any text to generate flashcards from…"}
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          maxLength={50000}
                          disabled={loading}
                          className="w-full min-h-[160px] max-mobile:min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">
                            {text.length} / 50000 characters
                          </span>
                          {text.length >= 50000 && (
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
                          disabled={loading}
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

                  {generationMode === "youtube" && (
                    <div className="space-y-3 pt-1">
                      <div className="space-y-2">
                        <label htmlFor="youtube-url" className="text-sm font-medium">
                          YouTube link
                        </label>
                        <Input
                          id="youtube-url"
                          type="url"
                          placeholder="https://www.youtube.com/watch?v=..."
                          value={youtubeUrl}
                          onChange={(e) => { setYoutubeUrl(e.target.value); setFormError(null); }}
                          disabled={loading}
                          className="min-w-0"
                        />
                        <p className="text-xs text-muted-foreground">
                          We&apos;ll pull the transcript and generate flashcards from it.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <label
                          htmlFor="cardCount-yt"
                          className="text-sm font-medium shrink-0"
                        >
                          Number of cards
                        </label>
                        <select
                          id="cardCount-yt"
                          value={cardCount}
                          onChange={(e) => setCardCount(Number(e.target.value))}
                          disabled={loading}
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

                  {generationMode === "url" && (
                    <div className="space-y-3 pt-1">
                      <div className="space-y-2">
                        <label htmlFor="article-url" className="text-sm font-medium">
                          Wikipedia URL
                        </label>
                        <Input
                          id="article-url"
                          type="url"
                          placeholder="https://en.wikipedia.org/wiki/..."
                          value={articleUrl}
                          onChange={(e) => { setArticleUrl(e.target.value); setFormError(null); }}
                          disabled={loading}
                          className="min-w-0"
                        />
                        <p className="text-xs text-muted-foreground">
                          We&apos;ll extract the article text and generate flashcards from it.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <label
                          htmlFor="cardCount-url"
                          className="text-sm font-medium shrink-0"
                        >
                          Number of cards
                        </label>
                        <select
                          id="cardCount-url"
                          value={cardCount}
                          onChange={(e) => setCardCount(Number(e.target.value))}
                          disabled={loading}
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

                  {generationMode === "import" && (
                    <div className="space-y-3 pt-1">
                      <div className="space-y-2">
                        <label htmlFor="import-text" className="text-sm font-medium">
                          Paste Q/A text or upload a .txt file
                        </label>
                        <textarea
                          id="import-text"
                          placeholder={"Q: What is photosynthesis?\nA: The process by which plants convert light energy into chemical energy.\n\nQ: What is mitosis?\nA: A type of cell division that results in two identical daughter cells."}
                          value={importText}
                          onChange={(e) => { setImportText(e.target.value); setImportError(null); }}
                          disabled={loading}
                          className="w-full min-h-[160px] max-mobile:min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                        />
                        <div className="flex items-center gap-3">
                          <label
                            htmlFor="import-file-upload"
                            className="inline-flex items-center gap-1.5 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Upload className="size-3.5" />
                            Upload .txt file
                          </label>
                          <input
                            ref={importFileRef}
                            id="import-file-upload"
                            type="file"
                            accept=".txt,text/plain"
                            onChange={handleImportFileUpload}
                            disabled={loading}
                            className="sr-only"
                          />
                        </div>
                      </div>
                      {importQAPairs && importQAPairs.length > 0 && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          {importQAPairs.length} Q/A pair{importQAPairs.length === 1 ? "" : "s"} detected — will be imported directly, no AI.
                        </p>
                      )}
                      {importTextTrimmed && !importQAPairs && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          No valid Q:/A: pairs found. Each card needs a Q: and A: line.
                        </p>
                      )}
                      {importError && (
                        <p className="text-xs text-destructive">{importError}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Cards are imported exactly as written — no AI generation or paraphrasing.
                      </p>
                    </div>
                  )}
          </section>
        )}

        {formError && (
          <p className="text-sm text-destructive">{formError}</p>
        )}

        <div className="pt-4 border-t border-border/40">
          <Button type="submit" disabled={loading} className="w-full sm:w-auto">
            {submitLabel}
          </Button>
        </div>
      </form>
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
