"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildYoutubeDeckSourceMetadata,
  createDeck,
  fetchWebpageContent,
  fetchYouTubeTranscript,
  generateFlashcardsBackground,
  getUsers,
  importFlashcards,
  isYouTubePlaylistUrl,
  normalizeYouTubeUrl,
  parseQAPairs,
  TranscriptFetchError,
} from "@/lib/api";
import { getStoredUserId, useCardCountOptions } from "@/components/user-selector";
import { GENERATION_TEXT_MAX_CHARS } from "@/lib/generation-text";
import { markDeckBackgroundGenerationNavigation } from "@/lib/deck-pending-generation";
import { Upload } from "lucide-react";
import PageContainer from "@/components/layout/page-container";

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
  const cardCountOptions = useCardCountOptions();
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [autoSwitchHint, setAutoSwitchHint] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [ytFallbackUrl, setYtFallbackUrl] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importFiles, setImportFiles] = useState<{ name: string; pairCount: number; error?: string }[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [textUploadStatus, setTextUploadStatus] = useState<string | null>(null);

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

  useEffect(() => {
    if (generationMode !== "text") setTextUploadStatus(null);
  }, [generationMode]);

  useEffect(() => {
    setCardCount((c) => {
      const max = cardCountOptions[cardCountOptions.length - 1];
      if (max === undefined) return c;
      return c > max ? max : c;
    });
  }, [cardCountOptions]);

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
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImportError(null);

    const fileArray = Array.from(files);
    const badType = fileArray.filter((f) => !f.name.endsWith(".txt") && f.type !== "text/plain");
    const tooBig = fileArray.filter((f) => f.size > 500_000);
    if (badType.length > 0) {
      setImportError(`Only .txt files are supported. Skipped: ${badType.map((f) => f.name).join(", ")}`);
    }
    if (tooBig.length > 0) {
      setImportError(`File too large (max 500 KB each): ${tooBig.map((f) => f.name).join(", ")}`);
    }

    const validFiles = fileArray.filter(
      (f) => f.size <= 500_000 && (f.name.endsWith(".txt") || f.type === "text/plain")
    );
    if (validFiles.length === 0) return;

    const allTexts: string[] = [];
    const fileSummaries: { name: string; pairCount: number; error?: string }[] = [];
    let loaded = 0;

    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const pairs = parseQAPairs(text.trim());
        if (pairs && pairs.length > 0) {
          allTexts.push(text);
          fileSummaries.push({ name: file.name, pairCount: pairs.length });
        } else {
          fileSummaries.push({ name: file.name, pairCount: 0, error: "No valid Q:/A: pairs" });
        }
        loaded++;
        if (loaded === validFiles.length) {
          setImportText(allTexts.join("\n\n"));
          setImportFiles(fileSummaries);
          if (allTexts.length === 0) {
            setImportError("No valid Q:/A: pairs found in any of the uploaded files.");
          }
          if (importFileRef.current) importFileRef.current.value = "";
        }
      };
      reader.readAsText(file);
    });
  }

  function handleTextTabFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = "";
    setTextUploadStatus(null);
    if (!file) return;

    const nameLower = file.name.toLowerCase();
    if (!nameLower.endsWith(".txt")) {
      setTextUploadStatus("Only .txt files are supported.");
      return;
    }
    const mimeOk =
      file.type === "text/plain" ||
      file.type === "" ||
      file.type === "application/octet-stream";
    if (!mimeOk) {
      setTextUploadStatus("That file type is not supported. Please use a plain .txt file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      if (raw.length > GENERATION_TEXT_MAX_CHARS) {
        setText(raw.slice(0, GENERATION_TEXT_MAX_CHARS));
        setTextUploadStatus(
          `Loaded ${file.name} — trimmed to ${GENERATION_TEXT_MAX_CHARS.toLocaleString()} characters (limit).`,
        );
      } else {
        setText(raw);
        setTextUploadStatus(`Loaded ${file.name}.`);
      }
    };
    reader.onerror = () => {
      setTextUploadStatus("Could not read the file.");
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
      if (isYouTubePlaylistUrl(youtubeUrlTrimmed)) {
        setFormError("YouTube playlists aren\u2019t supported yet. Please paste a single video link.");
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
          source_segments: transcript.segments?.length ? JSON.stringify(transcript.segments) : undefined,
          source_metadata: buildYoutubeDeckSourceMetadata(transcript),
        });
        const deckId = (deck as { id: string }).id;

        await generateFlashcardsBackground({
          deck_id: deckId,
          text: transcript.transcript.slice(0, GENERATION_TEXT_MAX_CHARS),
          num_cards: cardCount,
          language: transcript.language || "en",
        }).catch(() => {});

        markDeckBackgroundGenerationNavigation(deckId);
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

        await generateFlashcardsBackground({
          deck_id: deckId,
          text: article.text.slice(0, GENERATION_TEXT_MAX_CHARS),
          num_cards: cardCount,
        }).catch(() => {});

        markDeckBackgroundGenerationNavigation(deckId);
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
        await generateFlashcardsBackground({
          deck_id: deckId,
          text: textTrimmed,
          num_cards: cardCount,
          language: "en",
        }).catch(() => {});
        markDeckBackgroundGenerationNavigation(deckId);
      } else if (generationMode === "topic" && effectiveTopic) {
        await generateFlashcardsBackground({
          deck_id: deckId,
          topic: effectiveTopic,
          num_cards: cardCount,
          language: "en",
        }).catch(() => {});
        markDeckBackgroundGenerationNavigation(deckId);
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
                          {cardCountOptions.map((n) => (
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
                          onChange={(e) => {
                            setText(e.target.value);
                            if (textUploadStatus) setTextUploadStatus(null);
                          }}
                          maxLength={GENERATION_TEXT_MAX_CHARS}
                          disabled={loading}
                          className="w-full min-h-[160px] max-mobile:min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <input
                              id="create-deck-text-upload"
                              type="file"
                              accept=".txt,text/plain"
                              onChange={handleTextTabFileUpload}
                              disabled={loading}
                              className="sr-only"
                            />
                            <label
                              htmlFor="create-deck-text-upload"
                              className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground ${loading ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
                            >
                              <Upload className="size-3.5 shrink-0" />
                              Upload .txt
                            </label>
                            {textUploadStatus && (
                              <span
                                className={`text-xs ${textUploadStatus.startsWith("Only ") || textUploadStatus.startsWith("That ") || textUploadStatus.startsWith("Could ") ? "text-destructive" : "text-muted-foreground"}`}
                              >
                                {textUploadStatus}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 sm:ml-auto">
                            <span className="text-xs text-muted-foreground">
                              {text.length} / {GENERATION_TEXT_MAX_CHARS.toLocaleString()} characters
                            </span>
                            {text.length >= GENERATION_TEXT_MAX_CHARS && (
                              <span className="text-xs text-destructive">
                                Text is too long
                              </span>
                            )}
                          </div>
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
                          {cardCountOptions.map((n) => (
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
                          {cardCountOptions.map((n) => (
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
                          {cardCountOptions.map((n) => (
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
                          onChange={(e) => { setImportText(e.target.value); setImportError(null); setImportFiles([]); }}
                          disabled={loading}
                          className="w-full min-h-[160px] max-mobile:min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                        />
                        <div className="flex items-center gap-3">
                          <label
                            htmlFor="import-file-upload"
                            className="inline-flex items-center gap-1.5 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Upload className="size-3.5" />
                            Upload .txt files
                          </label>
                          <input
                            ref={importFileRef}
                            id="import-file-upload"
                            type="file"
                            accept=".txt,text/plain"
                            multiple
                            onChange={handleImportFileUpload}
                            disabled={loading}
                            className="sr-only"
                          />
                        </div>
                      </div>
                      {importFiles.length > 0 && (
                        <div className="text-xs space-y-0.5">
                          {importFiles.map((f) => (
                            <p key={f.name} className={f.error ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                              {f.name}{f.error ? ` — ${f.error}` : ` — ${f.pairCount} pair${f.pairCount === 1 ? "" : "s"}`}
                            </p>
                          ))}
                        </div>
                      )}
                      {importQAPairs && importQAPairs.length > 0 && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          {importQAPairs.length} Q/A pair{importQAPairs.length === 1 ? "" : "s"} detected — will be imported directly, no AI.
                        </p>
                      )}
                      {importTextTrimmed && !importQAPairs && importFiles.length === 0 && (
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
