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
import { getStoredUserId, useTierLimits } from "@/components/user-selector";
import { GENERATION_TEXT_MAX_CHARS } from "@/lib/generation-text";
import { markDeckBackgroundGenerationNavigation } from "@/lib/deck-pending-generation";
import { Upload } from "lucide-react";
import PageContainer from "@/components/layout/page-container";
import { LongSourceTextarea } from "@/components/long-source-textarea";
import { GenerationLanguageToggle } from "@/components/generation-language-toggle";
import {
  generationLanguagePayload,
  normalizeLangCode,
  originalLanguageToggleLabel,
  transcriptLanguageDisplay,
  type GenerationLangPreference,
} from "@/lib/source-language";
import { startYoutubeTranscriptPhaseTimers } from "@/lib/youtube-fetch-status";

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
  const [genLangMode, setGenLangMode] = useState<GenerationLangPreference>("source");
  const { cardCountOptions, usage } = useTierLimits();
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [autoSwitchHint, setAutoSwitchHint] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [ytTextFallback, setYtTextFallback] = useState<{
    url: string;
    watchMetadataOk: boolean;
    title: string | null;
    failureCode: string | null;
  } | null>(null);
  const [importText, setImportText] = useState("");
  const [importFiles, setImportFiles] = useState<{ name: string; pairCount: number; error?: string }[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [textUploadStatus, setTextUploadStatus] = useState<string | null>(null);
  /** Filled after a successful YouTube transcript fetch; drives toggle label + helper line. */
  const [youtubeTranscriptLangRaw, setYoutubeTranscriptLangRaw] = useState<string | null>(null);

  useEffect(() => {
    const modeParam = searchParams.get("mode");
    const topicParam = searchParams.get("topic");
    const ytParam = searchParams.get("youtube");
    const titleParam = searchParams.get("title");

    if (modeParam === "text" && ytParam) {
      setGenerationMode("text");
      setYtTextFallback({
        url: ytParam,
        watchMetadataOk: false,
        title: titleParam || null,
        failureCode: null,
      });
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
    if (generationMode !== "youtube") setYoutubeTranscriptLangRaw(null);
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

  const genLangSourceLabelCreate = originalLanguageToggleLabel(
    generationMode === "youtube" ? youtubeTranscriptLangRaw : null
  );

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
    setLoadingMessage("");
    setYoutubeTranscriptLangRaw(null);

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
        setLoadingMessage("Saving…");
        const deck = await createDeck({
          user_id: userId,
          name: nameTrimmed,
          source_type: "text",
        });
        const deckId = (deck as { id: string }).id;
        setLoadingMessage("Importing…");
        try {
          await importFlashcards({ deck_id: deckId, cards: importQAPairs });
        } catch {
          /* Deck exists; user can import again from the deck page. */
        }
        router.push(`/decks/${deckId}`);
        return;
      }

      if (generationMode === "youtube") {
        const cleanYtUrl = normalizeYouTubeUrl(youtubeUrlTrimmed);
        const stopYtPhases = startYoutubeTranscriptPhaseTimers(setLoadingMessage);
        let transcript: Awaited<ReturnType<typeof fetchYouTubeTranscript>>;
        try {
          transcript = await fetchYouTubeTranscript(cleanYtUrl);
        } catch (err) {
          const tfe = err instanceof TranscriptFetchError ? err : null;
          setYtTextFallback({
            url: cleanYtUrl,
            watchMetadataOk: Boolean(tfe?.watchMetadataOk),
            title: tfe?.title ?? null,
            failureCode: tfe?.code ?? null,
          });
          setGenerationMode("text");
          if (tfe?.title && !nameTrimmed) {
            setName(tfe.title);
          }
          if (tfe?.code === "TRANSCRIPT_TOO_SHORT") {
            setFormError(
              "The transcript was too short to use. Paste a longer transcript or more notes below."
            );
          } else if (tfe?.watchMetadataOk) {
            setFormError(
              "Video found, but the transcript could not be retrieved. Paste the transcript or notes below."
            );
          } else {
            setFormError("Couldn\u2019t fetch transcript — paste text below.");
          }
          setLoading(false);
          setLoadingMessage("");
          return;
        } finally {
          stopYtPhases();
        }

        const langRaw = transcript.language?.trim() || null;
        setYoutubeTranscriptLangRaw(langRaw);

        const videoTitle = transcript.title || null;
        const deckName = nameTrimmed || videoTitle || "YouTube Deck";
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
          text: transcript.transcript.slice(0, GENERATION_TEXT_MAX_CHARS),
          num_cards: cardCount,
          ...generationLanguagePayload(genLangMode, normalizeLangCode(transcript.language)),
          youtube_route_reason: "youtube_transcript",
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
        setLoadingMessage("Saving…");

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
          ...generationLanguagePayload(genLangMode, null),
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

      setLoadingMessage("Saving…");
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
          ...generationLanguagePayload(genLangMode, null),
        }).catch(() => {});
        markDeckBackgroundGenerationNavigation(deckId);
      } else if (generationMode === "topic" && effectiveTopic) {
        await generateFlashcardsBackground({
          deck_id: deckId,
          topic: effectiveTopic,
          num_cards: cardCount,
          ...generationLanguagePayload(genLangMode, null),
        }).catch(() => {});
        markDeckBackgroundGenerationNavigation(deckId);
      }

      router.push(`/decks/${deckId}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to create deck. Please try again.");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  return (
    <PageContainer className="mx-auto w-full max-w-2xl">
      <div>
        <Link
          href="/decks"
          className="inline-flex h-7 items-center rounded-md px-1 -ml-1 text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">Create deck</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            Deck name
          </label>
          <Input
            id="name"
            placeholder={
              generationMode === "youtube"
                ? "Optional — uses video title if empty"
                : generationMode === "url"
                  ? "Optional — uses article title if empty"
                  : generationMode === "import"
                    ? "e.g. Biology final"
                    : "e.g. Spanish vocabulary"
            }
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            disabled={loading}
          />
        </div>

        <details className="rounded-lg border border-border/50 bg-muted/10 [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground">
            More options
          </summary>
          <div className="space-y-3 border-t border-border/40 px-3 pb-3 pt-3">
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
              <span className="text-muted-foreground">Empty deck (no cards yet)</span>
            </label>
            {!emptyDeckMode && generationMode === "topic" && !topicTrimmed && (
              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={useNameAsTopic}
                  onChange={(e) => setUseNameAsTopic(e.target.checked)}
                  className="rounded border-input"
                  disabled={loading}
                />
                <span className="text-muted-foreground">Use deck name as topic</span>
              </label>
            )}
          </div>
        </details>

        {!emptyDeckMode && (
          <div className="space-y-4 rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm sm:p-5">
            <div
              className="grid grid-cols-3 gap-1 rounded-lg border border-border/50 bg-muted/25 p-1 sm:grid-cols-5"
              role="radiogroup"
              aria-label="Source"
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
                  onClick={() => {
                    setGenerationMode(value);
                    setFormError(null);
                  }}
                  disabled={loading}
                  className={`rounded-md px-2 py-2 text-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm ${
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
              <p className="text-xs text-muted-foreground">{autoSwitchHint}</p>
            )}

            {generationMode === "topic" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label htmlFor="topic" className="text-sm font-medium">
                    Topic
                  </label>
                  <Input
                    id="topic"
                    placeholder="Optional — or add cards after creating"
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
                          setAutoSwitchHint("Switched to YouTube");
                        } else {
                          setArticleUrl(v.trim());
                          setGenerationMode("url");
                          setAutoSwitchHint("Switched to URL");
                        }
                        setTimeout(() => setAutoSwitchHint(null), 2500);
                      } else {
                        setTopic(v);
                        setAutoSwitchHint(null);
                      }
                    }}
                    className="min-w-0"
                    disabled={loading}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                  <span className="shrink-0">Cards</span>
                  <select
                    id="cardCount-topic"
                    value={cardCount}
                    onChange={(e) => setCardCount(Number(e.target.value))}
                    disabled={loading}
                    aria-label="Number of cards to generate"
                    className="h-9 min-w-[4.5rem] rounded-md border border-input bg-background px-2.5 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {cardCountOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <GenerationLanguageToggle
                    value={genLangMode}
                    onChange={setGenLangMode}
                    sourceLabel={genLangSourceLabelCreate}
                    disabled={loading}
                    className="sm:ml-1"
                  />
                </div>
              </div>
            )}

            {generationMode === "text" && (
              <div className="space-y-3">
                {ytTextFallback && (
                  <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
                    <p className="text-xs font-medium text-foreground">
                      {ytTextFallback.failureCode === "TRANSCRIPT_TOO_SHORT"
                        ? "The transcript was too short to use automatically."
                        : ytTextFallback.watchMetadataOk
                          ? "Video found, but the transcript could not be retrieved."
                          : "Transcript not fetched — paste manually"}
                    </p>
                    {ytTextFallback.title ? (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {ytTextFallback.title}
                      </p>
                    ) : null}
                    <ol className="mt-1.5 list-inside list-decimal space-y-0.5 text-xs text-muted-foreground">
                      <li>
                        <a
                          href={ytTextFallback.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 hover:text-foreground"
                        >
                          Open video
                        </a>
                      </li>
                      <li>
                        ⋯ → Show transcript → copy
                      </li>
                    </ol>
                  </div>
                )}
                <div className="space-y-2">
                  <label htmlFor="text" className="text-sm font-medium">
                    Text
                  </label>
                  <LongSourceTextarea
                    id="text"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      if (textUploadStatus) setTextUploadStatus(null);
                    }}
                    placeholder={
                      ytTextFallback
                        ? "Paste transcript…"
                        : "Notes, article text, etc."
                    }
                    maxLength={GENERATION_TEXT_MAX_CHARS}
                    disabled={loading}
                    auxiliaryRow={
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
                          className={`inline-flex items-center gap-1 underline-offset-2 hover:underline ${loading ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
                        >
                          <Upload className="size-3.5 shrink-0" />
                          .txt
                        </label>
                        {textUploadStatus && (
                          <span
                            className={
                              textUploadStatus.startsWith("Only ") ||
                              textUploadStatus.startsWith("That ") ||
                              textUploadStatus.startsWith("Could ")
                                ? "text-destructive"
                                : ""
                            }
                          >
                            {textUploadStatus}
                          </span>
                        )}
                      </div>
                    }
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                  <span className="shrink-0">Cards</span>
                  <select
                    id="cardCount-text"
                    value={cardCount}
                    onChange={(e) => setCardCount(Number(e.target.value))}
                    disabled={loading}
                    aria-label="Number of cards to generate"
                    className="h-9 min-w-[4.5rem] rounded-md border border-input bg-background px-2.5 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {cardCountOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <GenerationLanguageToggle
                    value={genLangMode}
                    onChange={setGenLangMode}
                    sourceLabel={genLangSourceLabelCreate}
                    disabled={loading}
                    className="sm:ml-1"
                  />
                </div>
              </div>
            )}

            {generationMode === "youtube" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label htmlFor="youtube-url" className="text-sm font-medium">
                    Video URL
                  </label>
                  <Input
                    id="youtube-url"
                    type="url"
                    placeholder="youtube.com/watch?v=…"
                    value={youtubeUrl}
                    onChange={(e) => {
                      setYoutubeUrl(e.target.value);
                      setFormError(null);
                      setYoutubeTranscriptLangRaw(null);
                    }}
                    disabled={loading}
                    className="min-w-0"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                  <span className="shrink-0">Cards</span>
                  <select
                    id="cardCount-yt"
                    value={cardCount}
                    onChange={(e) => setCardCount(Number(e.target.value))}
                    disabled={loading}
                    aria-label="Number of cards to generate"
                    className="h-9 min-w-[4.5rem] rounded-md border border-input bg-background px-2.5 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {cardCountOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <GenerationLanguageToggle
                    value={genLangMode}
                    onChange={setGenLangMode}
                    sourceLabel={genLangSourceLabelCreate}
                    disabled={loading}
                    className="sm:ml-1"
                  />
                </div>
                {youtubeTranscriptLangRaw ? (
                  <p className="text-xs text-muted-foreground leading-snug">
                    Transcript language: {transcriptLanguageDisplay(youtubeTranscriptLangRaw)}
                  </p>
                ) : null}
              </div>
            )}

            {generationMode === "url" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label htmlFor="article-url" className="text-sm font-medium">
                    URL
                  </label>
                  <Input
                    id="article-url"
                    type="url"
                    placeholder="Wikipedia article URL"
                    value={articleUrl}
                    onChange={(e) => {
                      setArticleUrl(e.target.value);
                      setFormError(null);
                    }}
                    disabled={loading}
                    className="min-w-0"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                  <span className="shrink-0">Cards</span>
                  <select
                    id="cardCount-url"
                    value={cardCount}
                    onChange={(e) => setCardCount(Number(e.target.value))}
                    disabled={loading}
                    aria-label="Number of cards to generate"
                    className="h-9 min-w-[4.5rem] rounded-md border border-input bg-background px-2.5 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {cardCountOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <GenerationLanguageToggle
                    value={genLangMode}
                    onChange={setGenLangMode}
                    sourceLabel={genLangSourceLabelCreate}
                    disabled={loading}
                    className="sm:ml-1"
                  />
                </div>
              </div>
            )}

            {generationMode === "import" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label htmlFor="import-text" className="text-sm font-medium">
                    Import
                  </label>
                  <textarea
                    id="import-text"
                    placeholder={"Q: …\nA: …"}
                    value={importText}
                    onChange={(e) => {
                      setImportText(e.target.value);
                      setImportError(null);
                      setImportFiles([]);
                    }}
                    disabled={loading}
                    className="w-full min-h-[140px] max-mobile:min-h-[120px] rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <div className="flex flex-wrap items-center gap-3">
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
                    <label
                      htmlFor="import-file-upload"
                      className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      <Upload className="size-3.5" />
                      Upload .txt
                    </label>
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer hover:text-foreground [&::-webkit-details-marker]:hidden">
                        Format
                      </summary>
                      <p className="mt-2 border-l-2 border-border/60 pl-2 text-[11px] leading-relaxed">
                        One card per Q:/A: block. Imported as-is (no AI).
                      </p>
                    </details>
                  </div>
                </div>
                {importFiles.length > 0 && (
                  <div className="space-y-0.5 text-xs">
                    {importFiles.map((f) => (
                      <p
                        key={f.name}
                        className={
                          f.error ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                        }
                      >
                        {f.name}
                        {f.error ? ` — ${f.error}` : ` — ${f.pairCount} pair${f.pairCount === 1 ? "" : "s"}`}
                      </p>
                    ))}
                  </div>
                )}
                {importQAPairs && importQAPairs.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Ready: {importQAPairs.length} card{importQAPairs.length === 1 ? "" : "s"}
                  </p>
                )}
                {importTextTrimmed && !importQAPairs && importFiles.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Need Q: and A: lines per card.
                  </p>
                )}
                {importError && <p className="text-xs text-destructive">{importError}</p>}
              </div>
            )}
          </div>
        )}

        {usage?.limited_tier &&
          usage.max_active_decks != null &&
          usage.active_deck_count >= usage.max_active_decks && (
            <p className="text-sm text-muted-foreground">
              Free plan: {usage.max_active_decks} active decks max. Archive or delete one to create
              another.
            </p>
          )}

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <div className="space-y-2 pt-1">
          <Button
            type="submit"
            disabled={
              loading ||
              (usage?.limited_tier === true &&
                usage.max_active_decks != null &&
                usage.active_deck_count >= usage.max_active_decks)
            }
            size="lg"
            className="w-full font-semibold sm:w-auto sm:min-w-[10rem]"
          >
            {loading ? "Working…" : "Create deck"}
          </Button>
          {loading && loadingMessage ? (
            <p
              className="text-sm text-muted-foreground leading-snug"
              role="status"
              aria-live="polite"
            >
              {loadingMessage}
            </p>
          ) : null}
          {loading && (
            <div
              className="h-0.5 w-full max-w-[11rem] overflow-hidden rounded-full bg-muted sm:max-w-[10rem]"
              aria-hidden
            >
              <div className="deck-load-indeterminate-fill h-full w-[38%] rounded-full bg-primary/45" />
            </div>
          )}
        </div>
      </form>
    </PageContainer>
  );
}

export default function CreateDeckPage() {
  return (
    <Suspense
      fallback={
        <PageContainer className="mx-auto max-w-2xl w-full">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </PageContainer>
      }
    >
      <CreateDeckForm />
    </Suspense>
  );
}
