"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildYoutubeDeckSourceMetadata,
  createDeck,
  deleteDeck,
  fetchWebpageContent,
  fetchYouTubeTranscript,
  generateFlashcardsBackground,
  getUsers,
  importFlashcards,
  isYouTubePlaylistUrl,
  normalizeYouTubeUrl,
  parseDeckTextImport,
  TranscriptFetchError,
} from "@/lib/api";
import { getStoredUserId, useTierLimits } from "@/components/user-selector";
import {
  clearStoredGuestTrialDeckId,
  getGuestTrialUserId,
  getStoredGuestTrialDeckId,
  GUEST_TRIAL_MAX_CARDS,
  setStoredGuestTrialDeckId,
} from "@/lib/guest-trial";
import { GENERATION_TEXT_MAX_CHARS } from "@/lib/generation-text";
import { markDeckBackgroundGenerationNavigation } from "@/lib/deck-pending-generation";
import { Lock, Upload } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  guestSourceLockCopy,
  isSourceModeLockedForGuest,
  signedOutNoGuestTrialCopy,
  type CreateDeckSourceMode,
  type GuestSourceLockKind,
} from "@/lib/create-deck-guest-source";

const SIGNIN_CREATE_DECK_HREF = `/signin?callbackUrl=${encodeURIComponent("/create-deck")}`;

function GuestSourceSignInCallout({ kind }: { kind: GuestSourceLockKind }) {
  const copy = guestSourceLockCopy(kind);
  return (
    <div
      id="guest-source-signin-callout"
      className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-4 py-10 text-center shadow-sm dark:border-amber-500/25 dark:bg-amber-500/[0.09] sm:px-6 sm:py-12"
      role="region"
      aria-labelledby="guest-source-signin-headline"
    >
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-full border border-amber-500/35 bg-background/80">
          <Lock className="size-5 text-muted-foreground" aria-hidden />
        </span>
        <p
          id="guest-source-signin-headline"
          className="text-base font-semibold text-foreground leading-snug"
        >
          {copy.headline}
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {copy.subline}{" "}
          <Link
            href={SIGNIN_CREATE_DECK_HREF}
            className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function SignInRequiredNoGuestPanel() {
  const copy = signedOutNoGuestTrialCopy();
  return (
    <div
      id="sign-in-required-no-guest-callout"
      className="rounded-lg border border-border/60 bg-muted/20 px-4 py-10 text-center shadow-sm sm:px-6 sm:py-11"
      role="region"
      aria-labelledby="sign-in-required-no-guest-headline"
    >
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-full border border-border/70 bg-background/90">
          <Lock className="size-5 text-muted-foreground" aria-hidden />
        </span>
        <p
          id="sign-in-required-no-guest-headline"
          className="text-base font-semibold text-foreground leading-snug"
        >
          {copy.headline}
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">{copy.body}</p>
        <p className="text-xs text-muted-foreground/90 leading-relaxed">{copy.note}</p>
      </div>
    </div>
  );
}

type GenerationMode = CreateDeckSourceMode;

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const guestTrialUserId = useMemo(() => getGuestTrialUserId(), []);
  const isGuestTrial = status === "unauthenticated" && Boolean(guestTrialUserId);
  /** Signed out and guest trial env unset: entire source area is sign-in-first (no deck creation). */
  const signInRequiredNoGuestTrial = status === "unauthenticated" && !guestTrialUserId;
  /** Signed-out guest on YouTube / URL / Import: show sign-in callout instead of the real form. */
  const guestLockedPanel =
    isGuestTrial &&
    (generationMode === "youtube" || generationMode === "url" || generationMode === "import");
  /** All sources locked with informational panel (guest trial disabled). */
  const signedOutFormLockedPanel =
    signInRequiredNoGuestTrial && !emptyDeckMode;
  const { cardCountOptions: tierCardOptions, usage } = useTierLimits();
  const cardCountOptions = isGuestTrial ? [GUEST_TRIAL_MAX_CARDS] : tierCardOptions;
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [autoSwitchHint, setAutoSwitchHint] = useState<string | null>(null);

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
    const nameParam = searchParams.get("name");
    const textParam = searchParams.get("text");
    const urlParam = searchParams.get("url");
    const ytUrlRe = /(?:youtube\.com\/|youtu\.be\/)/i;

    if (modeParam === "text" && ytParam) {
      if (isGuestTrial) {
        setGenerationMode("youtube");
        setYtTextFallback(null);
        if (titleParam) setName(titleParam);
      } else {
        setGenerationMode("text");
        setYtTextFallback({
          url: ytParam,
          watchMetadataOk: false,
          title: titleParam || null,
          failureCode: null,
        });
        if (titleParam) setName(titleParam);
      }
    } else if (urlParam?.trim()) {
      const u = urlParam.trim();
      if (nameParam) setName(nameParam);
      if (isGuestTrial) {
        setGenerationMode(ytUrlRe.test(u) ? "youtube" : "url");
        if (topicParam) setTopic(topicParam);
      } else if (ytUrlRe.test(u)) {
        setYoutubeUrl(u);
        setGenerationMode("youtube");
        if (topicParam) setTopic(topicParam);
      } else {
        setArticleUrl(u);
        setGenerationMode("url");
        if (topicParam) setTopic(topicParam);
      }
    } else if (textParam != null && String(textParam).trim() !== "") {
      setText(String(textParam));
      setGenerationMode("text");
      if (nameParam) setName(nameParam);
      if (topicParam) setTopic(topicParam);
    } else if (topicParam) {
      setTopic(topicParam);
      setGenerationMode("topic");
      if (nameParam) setName(nameParam);
    } else if (ytParam) {
      if (isGuestTrial) {
        setGenerationMode("youtube");
        if (nameParam) setName(nameParam);
      } else {
        setYoutubeUrl(ytParam);
        setGenerationMode("youtube");
        if (nameParam) setName(nameParam);
      }
    }
  }, [searchParams, isGuestTrial]);

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

  useEffect(() => {
    if (isGuestTrial) setCardCount(GUEST_TRIAL_MAX_CARDS);
  }, [isGuestTrial]);

  const nameTrimmed = name.trim();
  const topicTrimmed = topic.trim();
  const textTrimmed = text.trim();
  const youtubeUrlTrimmed = youtubeUrl.trim();
  const articleUrlTrimmed = articleUrl.trim();

  const importTextTrimmed = importText.trim();
  const importDeckTextResult = useMemo(() => {
    if (generationMode !== "import" || !importTextTrimmed) {
      return null;
    }
    return parseDeckTextImport(importTextTrimmed);
  }, [generationMode, importTextTrimmed]);
  const importQAPairs =
    importDeckTextResult && importDeckTextResult.ok ? importDeckTextResult.pairs : null;
  const importParseError =
    importDeckTextResult && !importDeckTextResult.ok
      ? importDeckTextResult.error
      : null;

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
        const parsed = parseDeckTextImport(text.trim());
        if (parsed.ok && parsed.pairs.length > 0) {
          allTexts.push(text);
          fileSummaries.push({ name: file.name, pairCount: parsed.pairs.length });
        } else {
          fileSummaries.push({ name: file.name, pairCount: 0, error: "No importable cards" });
        }
        loaded++;
        if (loaded === validFiles.length) {
          setImportText(allTexts.join("\n\n"));
          setImportFiles(fileSummaries);
          if (allTexts.length === 0) {
            setImportError("No importable text found. Use a deck .txt export or Q: / A: pairs in each file.");
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

    if (signInRequiredNoGuestTrial) {
      return;
    }

    if (isGuestTrial && !emptyDeckMode && isSourceModeLockedForGuest(generationMode)) {
      return;
    }

    if (emptyDeckMode) {
      if (!nameTrimmed) {
        setFormError("Enter a deck name for your empty deck.");
        return;
      }
    } else if (generationMode === "import") {
      if (!importQAPairs || importQAPairs.length === 0) {
        setFormError(
          importParseError ||
            "Paste or upload a deck export (.txt) or Q: / A: list first."
        );
        return;
      }
      const exportTitle =
        importDeckTextResult?.ok &&
        importDeckTextResult.format === "export" &&
        importDeckTextResult.metadata?.title
          ? importDeckTextResult.metadata.title
          : null;
      if (!nameTrimmed && !exportTitle) {
        setFormError("Please enter a deck name for the imported cards.");
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

    if (status === "loading") {
      setFormError("Checking session…");
      return;
    }

    let userId: string | null = null;
    if (status === "authenticated") {
      userId = getStoredUserId();
      if (!userId) {
        const users = await getUsers();
        if (Array.isArray(users) && users.length > 0) {
          userId = users[0].id;
        } else {
          setFormError("Could not resolve your account. Please refresh or sign in again.");
          return;
        }
      }
    } else if (status === "unauthenticated") {
      userId = guestTrialUserId;
      if (!userId) {
        return;
      }
    } else {
      setFormError("Sign in to create decks.");
      return;
    }

    if (!userId) return;

    const generationCardTarget = isGuestTrial ? Math.min(GUEST_TRIAL_MAX_CARDS, cardCount) : cardCount;

    if (
      isGuestTrial &&
      generationMode === "import" &&
      importQAPairs &&
      importQAPairs.length > GUEST_TRIAL_MAX_CARDS
    ) {
      setFormError(
        `Trial mode: import at most ${GUEST_TRIAL_MAX_CARDS} cards. Sign in to import larger decks.`
      );
      return;
    }

    setLoading(true);
    setLoadingMessage("");
    setYoutubeTranscriptLangRaw(null);

    try {
      if (isGuestTrial && guestTrialUserId) {
        const prev = getStoredGuestTrialDeckId();
        if (prev) {
          try {
            await deleteDeck(prev);
          } catch {
            /* stale id */
          }
        }
        clearStoredGuestTrialDeckId();
      }

      const goToDeck = (deckId: string) => {
        if (isGuestTrial) setStoredGuestTrialDeckId(deckId);
        router.push(`/decks/${deckId}`);
      };

      if (emptyDeckMode) {
        const deck = await createDeck({
          user_id: userId,
          name: nameTrimmed,
          source_type: "manual",
        });
        const deckId = (deck as { id: string }).id;
        goToDeck(deckId);
        return;
      }

      if (generationMode === "import" && importQAPairs) {
        setLoadingMessage("Saving…");
        const m =
          importDeckTextResult?.ok && importDeckTextResult.format === "export"
            ? importDeckTextResult.metadata
            : undefined;
        const deckName = nameTrimmed || m?.title || "Imported deck";
        const sourceUrl = m?.sourceUrl;
        const isYoutubeExport = Boolean(
          sourceUrl &&
            /youtube\.com|youtu\.be/i.test(sourceUrl) &&
            /youtube/i.test((m?.source || "").toLowerCase())
        );
        const deck = await createDeck({
          user_id: userId,
          name: deckName,
          source_type: isYoutubeExport ? "youtube" : "text",
          source_url: m?.sourceUrl || undefined,
          source_topic: m?.topic || m?.title || undefined,
        });
        const deckId = (deck as { id: string }).id;
        setLoadingMessage("Importing…");
        try {
          await importFlashcards({ deck_id: deckId, cards: importQAPairs });
        } catch {
          /* Deck exists; user can import again from the deck page. */
        }
        goToDeck(deckId);
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
          num_cards: generationCardTarget,
          ...generationLanguagePayload(genLangMode, normalizeLangCode(transcript.language)),
          youtube_route_reason: "youtube_transcript",
        }).catch(() => {});

        markDeckBackgroundGenerationNavigation(deckId);
        goToDeck(deckId);
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
          num_cards: generationCardTarget,
          ...generationLanguagePayload(genLangMode, null),
        }).catch(() => {});

        markDeckBackgroundGenerationNavigation(deckId);
        goToDeck(deckId);
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
          num_cards: generationCardTarget,
          ...generationLanguagePayload(genLangMode, null),
        }).catch(() => {});
        markDeckBackgroundGenerationNavigation(deckId);
      } else if (generationMode === "topic" && effectiveTopic) {
        await generateFlashcardsBackground({
          deck_id: deckId,
          topic: effectiveTopic,
          num_cards: generationCardTarget,
          ...generationLanguagePayload(genLangMode, null),
        }).catch(() => {});
        markDeckBackgroundGenerationNavigation(deckId);
      }

      goToDeck(deckId);
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
      {signInRequiredNoGuestTrial ? (
        <p className="text-sm text-muted-foreground leading-relaxed">
          Sign in to create decks and save them to your account.
        </p>
      ) : null}

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
            disabled={loading || signInRequiredNoGuestTrial}
          />
        </div>

        <details
          className={`rounded-lg border border-border/50 bg-muted/10 [&_summary::-webkit-details-marker]:hidden ${signInRequiredNoGuestTrial ? "pointer-events-none opacity-60" : ""}`}
        >
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
                disabled={loading || signInRequiredNoGuestTrial}
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
                  disabled={loading || signInRequiredNoGuestTrial}
                />
                <span className="text-muted-foreground">Use deck name as topic</span>
              </label>
            )}
          </div>
        </details>

        {signInRequiredNoGuestTrial && emptyDeckMode ? (
          <div
            className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 text-sm text-muted-foreground leading-relaxed"
            role="status"
          >
            <span className="font-medium text-foreground">Sign in to continue.</span> Empty decks and
            AI generation require an account. Guest trial is not enabled on this server.
          </div>
        ) : null}

        {!emptyDeckMode && (
          <div
            className={`space-y-4 rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm sm:p-5 ${signInRequiredNoGuestTrial ? "opacity-[0.97]" : ""}`}
          >
            <div
              className="grid grid-cols-3 gap-1 rounded-lg border border-border/50 bg-muted/25 p-1 sm:grid-cols-5"
              role="radiogroup"
              aria-label="Source"
              aria-describedby={
                guestLockedPanel
                  ? "guest-source-signin-callout"
                  : signedOutFormLockedPanel
                    ? "sign-in-required-no-guest-callout"
                    : undefined
              }
            >
              {(
                [
                  { value: "topic" as const, label: "Topic" },
                  { value: "text" as const, label: "Text" },
                  { value: "youtube" as const, label: "YouTube" },
                  { value: "url" as const, label: "URL" },
                  { value: "import" as const, label: "Import" },
                ] as const
              ).map(({ value, label }) => {
                const lockedGuest =
                  signInRequiredNoGuestTrial ||
                  (isGuestTrial && isSourceModeLockedForGuest(value));
                const selected = generationMode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    title={
                      signInRequiredNoGuestTrial
                        ? "Sign in to use this source"
                        : lockedGuest
                          ? "Available after sign-in — click to see details"
                          : undefined
                    }
                    onClick={() => {
                      setGenerationMode(value);
                      setFormError(null);
                    }}
                    disabled={loading || signInRequiredNoGuestTrial}
                    className={`rounded-md px-2 py-2 text-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm ${
                      lockedGuest && selected
                        ? "cursor-pointer bg-background text-foreground shadow-sm ring-1 ring-amber-500/45"
                        : lockedGuest && !selected
                          ? "cursor-pointer opacity-60 text-muted-foreground hover:text-foreground"
                          : selected
                            ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="inline-flex items-center justify-center gap-1">
                      {lockedGuest ? (
                        <Lock className="size-3 shrink-0 opacity-70" aria-hidden />
                      ) : null}
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
            {autoSwitchHint && (
              <p className="text-xs text-muted-foreground">{autoSwitchHint}</p>
            )}

            {guestLockedPanel ? (
              <GuestSourceSignInCallout kind={generationMode as GuestSourceLockKind} />
            ) : signedOutFormLockedPanel ? (
              <SignInRequiredNoGuestPanel />
            ) : (
              <>
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
                        if (isGuestTrial) {
                          setTopic("");
                          setFormError(null);
                          setGenerationMode(detected === "youtube" ? "youtube" : "url");
                          return;
                        }
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
                    placeholder={"Deck .txt export, or Q: … / A: … blocks"}
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
                        <span className="block">
                          <strong>Export</strong>: paste a .txt from the deck page (dashed lines and
                          1. 2. … questions). Optional title, category, and source are read from the
                          header.
                        </span>
                        <span className="mt-1 block">
                          <strong>Simple</strong>: one card per <code className="text-[10px]">Q:</code> /{" "}
                          <code className="text-[10px]">A:</code> block. No AI.
                        </span>
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
                    {importParseError ||
                      "Paste a deck export or use Q: and A: lines for each card."}
                  </p>
                )}
                {importError && <p className="text-xs text-destructive">{importError}</p>}
              </div>
            )}
              </>
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
          {signInRequiredNoGuestTrial ? (
            <Link
              href={SIGNIN_CREATE_DECK_HREF}
              className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-md text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 max-mobile:min-h-[44px]",
                "h-10 px-4 max-mobile:h-11 max-mobile:text-[15px]",
                "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 max-mobile:font-semibold",
                "w-full sm:w-auto sm:min-w-[10rem]"
              )}
            >
              Sign in to create
            </Link>
          ) : (
            <Button
              type="submit"
              disabled={
                loading ||
                status === "loading" ||
                (usage?.limited_tier === true &&
                  usage.max_active_decks != null &&
                  usage.active_deck_count >= usage.max_active_decks)
              }
              size="lg"
              className="w-full font-semibold sm:w-auto sm:min-w-[10rem]"
            >
              {loading ? "Working…" : "Create deck"}
            </Button>
          )}
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
