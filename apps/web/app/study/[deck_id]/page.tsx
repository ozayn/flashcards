"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Flashcard } from "@/components/study/Flashcard";
import FormattedText from "@/components/FormattedText";
import {
  buildAnswerDisplayText,
  buildAnswerSpeechText,
  shouldShowAnswerDetailed,
} from "@/lib/format-flashcard-answer-display";
import { cancelAllFlashcardSpeech } from "@/lib/flashcard-speech";
import {
  getFlashcards,
  getUserSettings,
  updateUserSettings,
  submitReview,
  deleteDeckReviews,
  setFlashcardBookmark,
  type UserSettings,
} from "@/lib/api";
import { FlashcardBookmarkStar } from "@/components/flashcard-bookmark-star";
import {
  clampCardIndex,
  clearDeckStudyResume,
  readDeckStudyResume,
  writeDeckStudyResume,
} from "@/lib/deck-study-resume";
import { getStoredUserId } from "@/components/user-selector";
import { FlashcardSpeakButton } from "@/components/flashcard-speak-button";
import { ReadTabReadAllBar } from "@/components/read-tab-read-all-bar";
import { ReadTabSpeakButton } from "@/components/read-tab-speak-button";
import { useReadTabAutoplay } from "@/hooks/use-read-tab-autoplay";
import { cn } from "@/lib/utils";

interface StudyPageProps {
  params: { deck_id: string };
}

interface StudyFlashcard {
  id: string;
  question: string;
  answer_short: string;
  answer_example?: string | null;
  answer_detailed?: string | null;
  bookmarked?: boolean;
}

/** Submodes inside the deck Explore experience (URL: ?view= read | cards | quiz). Legacy ?mode=study maps to quiz. */
type DeckView = "read" | "cards" | "quiz";

function parseDeckView(sp: URLSearchParams): DeckView {
  const v = sp.get("view");
  if (v === "quiz" || v === "cards" || v === "read") return v;
  if (sp.get("mode") === "study") return "quiz";
  return "read";
}

export default function StudyPage({ params }: StudyPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deckView = parseDeckView(searchParams);

  const setDeckView = useCallback(
    (next: DeckView) => {
      const p = new URLSearchParams(searchParams.toString());
      p.delete("mode");
      if (next === "read") p.delete("view");
      else p.set("view", next);
      const q = p.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const [flashcards, setFlashcards] = useState<StudyFlashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [noUserForStudy, setNoUserForStudy] = useState(false);
  const [userChangeKey, setUserChangeKey] = useState(0);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings>({
    think_delay_enabled: true,
    think_delay_ms: 1500,
    card_style: "paper",
    english_tts: "default",
    voice_style: "default",
    speech_voice: "",
  });
  const [canFlip, setCanFlip] = useState(false);
  const [studyMenuOpen, setStudyMenuOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const touchStartX = useRef(0);
  const studyMenuRef = useRef<HTMLDivElement>(null);
  const loadGenRef = useRef(0);
  const restoreAppliedForLoadGenRef = useRef<number | null>(null);
  /** Set when the user switches Read/Cards/Quiz so we restore position after refetch (localStorage may still list the previous mode). */
  const modeSwitchSnapshotRef = useRef<{ index: number; flipped: boolean } | null>(null);
  const cardIndexRef = useRef(0);
  const showAnswerRef = useRef(false);
  const [resumeReady, setResumeReady] = useState(false);
  const [resumeHint, setResumeHint] = useState(false);
  const [bookmarkBusyId, setBookmarkBusyId] = useState<string | null>(null);

  const readAutoplayCards = useMemo(
    () =>
      flashcards.map((c) => ({
        id: c.id,
        question: c.question,
        answerSpeech: buildAnswerSpeechText(
          c.answer_short,
          c.answer_example,
          c.answer_detailed
        ),
      })),
    [flashcards]
  );

  const readAllAutoplay = useReadTabAutoplay({
    readView: deckView === "read",
    sessionPrefix: `study-deck-${params.deck_id}-readall`,
    cards: readAutoplayCards,
    currentIndex: currentCardIndex,
    setCurrentIndex: setCurrentCardIndex,
    englishTts: userSettings.english_tts,
    voiceStyle: userSettings.voice_style,
    speechVoiceKey: userSettings.speech_voice,
  });
  const {
    state: readAllState,
    start: startReadAll,
    stop: stopReadAll,
    pause: pauseReadAll,
    resume: resumeReadAll,
    skipToNext: skipReadAllToNext,
  } = readAllAutoplay;

  const bookmarksOnlyParam = searchParams.get("bookmarks") === "1";

  const toggleBookmarksOnly = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    if (p.get("bookmarks") === "1") p.delete("bookmarks");
    else p.set("bookmarks", "1");
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    cardIndexRef.current = currentCardIndex;
  }, [currentCardIndex]);

  useEffect(() => {
    showAnswerRef.current = showAnswer;
  }, [showAnswer]);

  const changeDeckView = useCallback(
    (next: DeckView, fromUser: boolean) => {
      if (fromUser) {
        modeSwitchSnapshotRef.current = {
          index: cardIndexRef.current,
          flipped: showAnswerRef.current,
        };
      }
      setDeckView(next);
    },
    [setDeckView],
  );

  const startFromBeginning = useCallback(() => {
    stopReadAll();
    clearDeckStudyResume(params.deck_id);
    setCurrentCardIndex(0);
    setShowAnswer(false);
    setResumeHint(false);
  }, [params.deck_id, stopReadAll]);

  const isDev = process.env.NODE_ENV === "development";

  async function handleResetProgress() {
    const userId = getStoredUserId();
    if (!userId) return;
    setResetLoading(true);
    try {
      stopReadAll();
      await deleteDeckReviews(params.deck_id, userId);
      setResetConfirmOpen(false);
      clearDeckStudyResume(params.deck_id);
      setCurrentCardIndex(0);
      setShowAnswer(false);
      setSessionComplete(false);
      setUserChangeKey((k) => k + 1);
    } catch {
      // ignore
    } finally {
      setResetLoading(false);
    }
  }

  useEffect(() => {
    if (bookmarksOnlyParam && !getStoredUserId()) {
      const p = new URLSearchParams(searchParams.toString());
      p.delete("bookmarks");
      const q = p.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    }
  }, [bookmarksOnlyParam, pathname, router, searchParams, userChangeKey]);

  useEffect(() => {
    setLoading(true);
    setNoUserForStudy(false);
    async function fetchFlashcards() {
      const dueOnly = deckView === "quiz";
      const userId = getStoredUserId();
      if (dueOnly && !userId) {
        setFlashcards([]);
        setNoUserForStudy(true);
        setLoading(false);
        return;
      }
      const bookmarkedOnly = Boolean(bookmarksOnlyParam && userId);
      try {
        const data = await getFlashcards(params.deck_id, {
          dueOnly,
          userId: dueOnly ? userId ?? undefined : undefined,
          bookmarkedOnly,
        });
        setFlashcards(Array.isArray(data) ? data : []);
      } catch (err) {
        if (
          err instanceof Error &&
          err.message === "BOOKMARK_AUTH" &&
          bookmarksOnlyParam
        ) {
          const p = new URLSearchParams(searchParams.toString());
          p.delete("bookmarks");
          const q = p.toString();
          router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
        }
        setFlashcards([]);
      } finally {
        setLoading(false);
      }
    }

    fetchFlashcards();
  }, [params.deck_id, deckView, userChangeKey, bookmarksOnlyParam, pathname, router]);

  useEffect(() => {
    const handleUserChanged = () => setUserChangeKey((k) => k + 1);
    window.addEventListener("flashcard_user_changed", handleUserChanged);
    return () => window.removeEventListener("flashcard_user_changed", handleUserChanged);
  }, []);

  useEffect(() => {
    if (flashcards.length === 0) return;
    setCurrentCardIndex((i) => Math.min(i, Math.max(0, flashcards.length - 1)));
  }, [flashcards.length]);

  const handleBookmarkToggle = useCallback(
    async (cardId: string, next: boolean) => {
      if (!getStoredUserId()) return;
      setBookmarkBusyId(cardId);
      try {
        await setFlashcardBookmark(cardId, next);
        setFlashcards((prev) =>
          prev.map((c) => (c.id === cardId ? { ...c, bookmarked: next } : c))
        );
      } catch {
        /* ignore */
      } finally {
        setBookmarkBusyId(null);
      }
    },
    []
  );

  useEffect(() => {
    const userId = getStoredUserId();
    if (userId) {
      getUserSettings(userId)
        .then(setUserSettings)
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleSettingsChanged = (e: CustomEvent<{ settings: UserSettings }>) => {
      if (e.detail?.settings) setUserSettings(e.detail.settings);
    };
    window.addEventListener("flashcard_settings_changed", handleSettingsChanged as EventListener);
    return () => window.removeEventListener("flashcard_settings_changed", handleSettingsChanged as EventListener);
  }, []);

  useEffect(() => {
    loadGenRef.current += 1;
    restoreAppliedForLoadGenRef.current = null;
    setResumeReady(false);
    setResumeHint(false);
    setSessionComplete(false);
  }, [params.deck_id, deckView]);

  useEffect(() => {
    setCurrentCardIndex(0);
    setShowAnswer(false);
    cardIndexRef.current = 0;
    showAnswerRef.current = false;
    modeSwitchSnapshotRef.current = null;
  }, [params.deck_id]);

  useEffect(() => {
    const saved = readDeckStudyResume(params.deck_id);
    if (!saved?.mode) return;
    if (saved.mode === "quiz" && !getStoredUserId()) return;
    const current = parseDeckView(searchParams);
    if (saved.mode !== current) {
      setDeckView(saved.mode);
    }
  }, [params.deck_id, searchParams, setDeckView]);

  useEffect(() => {
    if (loading) return;

    if (noUserForStudy) {
      setResumeReady(true);
      return;
    }

    if (flashcards.length === 0) {
      setResumeReady(true);
      return;
    }

    const g = loadGenRef.current;
    if (restoreAppliedForLoadGenRef.current === g) {
      setResumeReady(true);
      return;
    }
    restoreAppliedForLoadGenRef.current = g;

    const snapshot = modeSwitchSnapshotRef.current;
    if (snapshot) {
      modeSwitchSnapshotRef.current = null;
      const idx = clampCardIndex(snapshot.index, flashcards.length);
      setCurrentCardIndex(idx);
      if (deckView === "read") {
        setShowAnswer(false);
      } else {
        setShowAnswer(snapshot.flipped);
      }
      setResumeReady(true);
      return;
    }

    const saved = readDeckStudyResume(params.deck_id);
    let effectiveMode: DeckView | undefined = saved?.mode;
    if (effectiveMode === "quiz" && !getStoredUserId()) {
      effectiveMode = undefined;
    }

    if (saved && effectiveMode === deckView) {
      const idx = clampCardIndex(saved.index, flashcards.length);
      setCurrentCardIndex(idx);
      if (deckView === "cards" || deckView === "quiz") {
        setShowAnswer(!!saved.flipped);
      } else {
        setShowAnswer(false);
      }
      if (idx > 0 || !!saved.flipped) {
        setResumeHint(true);
      }
    } else {
      const idx = clampCardIndex(cardIndexRef.current, flashcards.length);
      setCurrentCardIndex(idx);
      if (deckView === "read") {
        setShowAnswer(false);
      } else {
        setShowAnswer(showAnswerRef.current);
      }
    }

    setResumeReady(true);
  }, [loading, flashcards.length, deckView, params.deck_id, noUserForStudy]);

  useEffect(() => {
    if (!resumeHint) return;
    const t = window.setTimeout(() => setResumeHint(false), 4500);
    return () => window.clearTimeout(t);
  }, [resumeHint]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!resumeReady) return;
    if (loading || flashcards.length === 0 || noUserForStudy || sessionComplete) return;

    writeDeckStudyResume(params.deck_id, {
      index: currentCardIndex,
      mode: deckView,
      flipped: (deckView === "cards" || deckView === "quiz") && showAnswer,
      cardCount: flashcards.length,
    });
  }, [
    resumeReady,
    params.deck_id,
    deckView,
    currentCardIndex,
    showAnswer,
    flashcards.length,
    loading,
    noUserForStudy,
    sessionComplete,
  ]);

  useEffect(() => {
    if (loading || flashcards.length === 0 || sessionComplete) return;
    if (!userSettings.think_delay_enabled) {
      setCanFlip(true);
      return;
    }
    setCanFlip(false);
    const t = setTimeout(() => setCanFlip(true), userSettings.think_delay_ms);
    return () => clearTimeout(t);
  }, [loading, flashcards.length, sessionComplete, currentCardIndex, userSettings.think_delay_enabled, userSettings.think_delay_ms]);

  const handleNext = useCallback(() => {
    stopReadAll();
    setShowAnswer(false);
    setCurrentCardIndex((i) => Math.min(i + 1, flashcards.length - 1));
  }, [flashcards.length, stopReadAll]);

  const handlePrev = useCallback(() => {
    stopReadAll();
    setShowAnswer(false);
    setCurrentCardIndex((i) => Math.max(i - 1, 0));
  }, [stopReadAll]);

  const touchStartY = useRef(0);
  const touchLatestX = useRef(0);
  const touchLatestY = useRef(0);
  const readScrollRef = useRef<HTMLDivElement>(null);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) handlePrev();
      else handleNext();
    }
  }

  useEffect(() => {
    const el = readScrollRef.current;
    if (!el) return;
    function onStart(e: TouchEvent) {
      const t = e.touches[0];
      touchStartX.current = t.clientX;
      touchStartY.current = t.clientY;
      touchLatestX.current = t.clientX;
      touchLatestY.current = t.clientY;
    }
    function onMove(e: TouchEvent) {
      const t = e.touches[0];
      touchLatestX.current = t.clientX;
      touchLatestY.current = t.clientY;
    }
    function onFinish() {
      const dx = touchLatestX.current - touchStartX.current;
      const dy = touchLatestY.current - touchStartY.current;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (dx > 0) handlePrev();
        else handleNext();
      }
    }
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onFinish, { passive: true });
    el.addEventListener("touchcancel", onFinish, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onFinish);
      el.removeEventListener("touchcancel", onFinish);
    };
  }, [handlePrev, handleNext, deckView]);

  useEffect(() => {
    return () => {
      cancelAllFlashcardSpeech();
    };
  }, []);

  useEffect(() => {
    stopReadAll();
  }, [params.deck_id, deckView, stopReadAll]);

  useEffect(() => {
    if (!studyMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (studyMenuRef.current && !studyMenuRef.current.contains(e.target as Node)) {
        setStudyMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [studyMenuOpen]);

  useEffect(() => {
    if (loading || flashcards.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (deckView === "read") {
          if (currentCardIndex < flashcards.length - 1) handleNext();
        } else if (canFlip) {
          setShowAnswer((prev) => !prev);
        }
      }
      if (e.code === "ArrowRight") {
        e.preventDefault();
        if (currentCardIndex < flashcards.length - 1) handleNext();
      }
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        if (currentCardIndex > 0) handlePrev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loading, flashcards.length, canFlip, handleNext, handlePrev, deckView, currentCardIndex]);

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col pt-6 pb-8" data-study>
        <div className="max-w-4xl mx-auto w-full px-6 md:px-8 flex flex-col flex-1 justify-center gap-4">
          <Link
            href={`/decks/${params.deck_id}`}
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted w-fit"
          >
            ← Back
          </Link>
          <p className="text-muted-foreground">Loading flashcards...</p>
        </div>
      </main>
    );
  }

  if (noUserForStudy) {
    return (
      <main className="min-h-screen flex flex-col pt-6 pb-8" data-study>
        <div className="max-w-4xl mx-auto w-full px-6 md:px-8 flex flex-col flex-1 justify-center gap-4">
          <Link
            href={`/decks/${params.deck_id}`}
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted w-fit"
          >
            ← Back
          </Link>
          <p className="text-muted-foreground text-center">
            No user selected. Choose a user to use Quiz mode, or browse with Read or Cards.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/decks"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-5 text-sm font-medium w-fit"
            >
              Choose user
            </Link>
            <Button variant="outline" onClick={() => changeDeckView("cards", true)} className="w-fit">
              Browse all cards
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (flashcards.length === 0) {
    return (
      <main className="min-h-screen flex flex-col pt-6 pb-8" data-study>
        <div className="max-w-4xl mx-auto w-full px-6 md:px-8 flex flex-col flex-1 justify-center gap-4">
          <Link
            href={`/decks/${params.deck_id}`}
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted w-fit"
          >
            ← Back
          </Link>
          {deckView === "quiz" ? (
            <>
              <p className="text-muted-foreground text-center">
                {bookmarksOnlyParam
                  ? "No saved cards are due for quiz right now."
                  : "You&apos;re all caught up! No cards are due for quiz."}
              </p>
              {bookmarksOnlyParam ? (
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button variant="outline" onClick={toggleBookmarksOnly} className="w-fit">
                    Show all due cards
                  </Button>
                  <Button variant="outline" onClick={() => changeDeckView("cards", true)} className="w-fit">
                    Browse all cards
                  </Button>
                </div>
              ) : (
                <Button variant="outline" onClick={() => changeDeckView("cards", true)} className="w-fit">
                  Browse all cards
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-center">
                {bookmarksOnlyParam
                  ? "No saved cards in this deck."
                  : "No flashcards in this deck yet."}
              </p>
              {bookmarksOnlyParam ? (
                <Button
                  variant="outline"
                  onClick={toggleBookmarksOnly}
                  className="w-fit"
                >
                  Show all cards
                </Button>
              ) : (
                <Link
                  href={`/decks/${params.deck_id}/add-card`}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-5 text-sm font-medium w-fit"
                >
                  Add Cards
                </Link>
              )}
            </>
          )}
        </div>
      </main>
    );
  }

  const card = flashcards[currentCardIndex];
  const isFirst = currentCardIndex === 0;
  const isLast = currentCardIndex === flashcards.length - 1;

  if (sessionComplete) {
    return (
      <main className="h-full min-h-[50vh] flex flex-col pt-6 pb-8" data-study>
        <div className="max-w-4xl mx-auto w-full px-6 md:px-8 flex flex-col flex-1">
          <Link
            href={`/decks/${params.deck_id}`}
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted w-fit"
          >
            ← Back
          </Link>
          <div className="flex flex-1 w-full justify-center items-center mt-12">
            <div className="max-w-md w-full text-center space-y-6">
              <h2 className="text-2xl font-semibold">Session complete</h2>
              <p className="text-muted-foreground">All {flashcards.length} cards quizzed.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={() => {
                    stopReadAll();
                    setSessionComplete(false);
                    setCurrentCardIndex(0);
                    setShowAnswer(false);
                  }}
                >
                  Quiz again
                </Button>
                <Link
                  href={`/decks/${params.deck_id}`}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
                >
                  Back to deck
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const rateCard = async (rating: "again" | "hard" | "good" | "easy") => {
    stopReadAll();
    const userId = getStoredUserId();
    if (userId) {
      try {
        await submitReview(card.id, rating, userId);
      } catch {
        // ignore
      }
    }
    if (rating === "again") {
      setFlashcards((prev) => [...prev, card]);
    }
    setShowAnswer(false);
    if (isLast && rating !== "again") {
      setSessionComplete(true);
    } else {
      setCurrentCardIndex((i) => i + 1);
    }
  };

  return (
    <main className="h-full min-h-0 flex flex-col items-center overflow-hidden relative landscape-mobile:h-[100dvh] landscape-mobile:max-h-[100dvh]" data-study>
      {resetConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => !resetLoading && setResetConfirmOpen(false)}
        >
          <div
            className="bg-background rounded-lg shadow-lg p-6 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-2">Reset progress for this deck?</h2>
            <p className="text-sm text-muted-foreground mb-4">
              All review history for this deck will be deleted. Cards will appear as new.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => !resetLoading && setResetConfirmOpen(false)}
                disabled={resetLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleResetProgress}
                disabled={resetLoading}
              >
                {resetLoading ? "Resetting..." : "Reset"}
              </Button>
            </div>
          </div>
        </div>
      )}
      <header className="relative z-30 shrink-0 w-full border-b border-border/40 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-3 py-2 sm:px-6 sm:py-2.5 md:px-8 landscape-mobile:py-1.5 landscape-mobile:pl-2 landscape-mobile:pr-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={`/decks/${params.deck_id}`}
              className="shrink-0 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:px-2 sm:text-sm"
            >
              ← Back
            </Link>
            <div className="flex min-w-0 flex-1 flex-col items-stretch gap-0.5 sm:mx-auto sm:max-w-[min(100%,19rem)] sm:flex-initial">
              <div
                className="grid min-w-0 grid-cols-3 gap-0.5 rounded-lg border border-border/50 bg-muted/20 p-0.5 sm:flex sm:flex-1"
                role="tablist"
                aria-label="Study mode"
              >
                {(["read", "cards", "quiz"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={deckView === v}
                    onClick={() => changeDeckView(v, true)}
                    className={`rounded-md px-2 py-1.5 text-center text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-8 sm:flex-1 sm:px-2 sm:text-xs ${
                      deckView === v
                        ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v === "read" ? "Read" : v === "cards" ? "Cards" : "Quiz"}
                  </button>
                ))}
              </div>
              <div className="flex min-h-5 flex-wrap items-center justify-center gap-x-3 gap-y-0.5">
                {resumeHint && (
                  <span className="text-[11px] text-muted-foreground">Resumed where you left off</span>
                )}
                <button
                  type="button"
                  onClick={startFromBeginning}
                  className="text-[11px] text-muted-foreground/90 underline-offset-2 hover:text-foreground hover:underline"
                >
                  Start from beginning
                </button>
                {getStoredUserId() ? (
                  <button
                    type="button"
                    onClick={toggleBookmarksOnly}
                    className={`text-[11px] underline-offset-2 hover:underline ${
                      bookmarksOnlyParam
                        ? "font-medium text-foreground"
                        : "text-muted-foreground/90 hover:text-foreground"
                    }`}
                  >
                    {bookmarksOnlyParam ? "Saved only · Show all" : "Saved only"}
                  </button>
                ) : null}
              </div>
            </div>
            <div ref={studyMenuRef} className="relative shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setStudyMenuOpen((o) => !o)}
                className="size-8 text-muted-foreground hover:text-foreground landscape-mobile:size-7"
                aria-label="More options"
                aria-expanded={studyMenuOpen}
              >
                <MoreHorizontal className="size-4 landscape-mobile:size-3.5" />
              </Button>
              {studyMenuOpen && (
                <div className="absolute right-0 top-full z-[60] mt-1 w-52 rounded-lg border border-border bg-popover p-2 shadow-lg">
                  <div className="flex items-center justify-between gap-2 px-1 py-1">
                    <span className="text-xs text-muted-foreground">Theme</span>
                    <ThemeToggle className="size-8 shrink-0 [&_svg]:size-4" />
                  </div>
                  <p className="px-1 pt-1 text-xs font-medium text-muted-foreground">Card style</p>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    {(["paper", "minimal", "modern", "anki"] as const).map((style) => (
                      <button
                        key={style}
                        type="button"
                        onClick={async () => {
                          const userId = getStoredUserId();
                          if (userId) {
                            const updated = await updateUserSettings(userId, { card_style: style });
                            setUserSettings(updated);
                            setStudyMenuOpen(false);
                          }
                        }}
                        className={`rounded px-2 py-1 text-xs font-medium capitalize ${
                          userSettings.card_style === style ? "bg-accent" : "hover:bg-muted"
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 border-t border-border pt-2">
                    <Link
                      href={`/decks/${params.deck_id}`}
                      className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                      onClick={() => setStudyMenuOpen(false)}
                    >
                      Exit to deck
                    </Link>
                    {isDev && (
                      <button
                        type="button"
                        className="mt-0.5 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => {
                          setStudyMenuOpen(false);
                          setResetConfirmOpen(true);
                        }}
                      >
                        Reset progress…
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {deckView === "read" ? (
        <div
          ref={readScrollRef}
          className="relative z-0 min-h-0 w-full flex-1 touch-pan-y overflow-y-auto landscape-mobile:min-h-0"
        >
          <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:max-w-3xl sm:px-6 sm:py-7 md:px-8 landscape-mobile:px-3 landscape-mobile:py-3">
            <article
              dir="auto"
              className={cn(
                "relative space-y-4 sm:space-y-6 landscape-mobile:space-y-3",
                getStoredUserId() &&
                  "pt-1 pe-11 sm:pe-12 landscape-mobile:pt-0.5 landscape-mobile:pe-10"
              )}
            >
              <div className="mb-0 flex min-h-0 flex-wrap items-center gap-1 sm:gap-1.5">
                <ReadTabSpeakButton
                  utteranceKey={`study-deck-${params.deck_id}-read-full-${card.id}`}
                  question={card.question}
                  answer={buildAnswerSpeechText(
                    card.answer_short,
                    card.answer_example,
                    card.answer_detailed
                  )}
                  englishTts={userSettings.english_tts}
                  voiceStyle={userSettings.voice_style}
                  speechVoiceKey={userSettings.speech_voice}
                />
                <ReadTabReadAllBar
                  className="ms-0.5"
                  state={readAllState}
                  disabled={flashcards.length < 1}
                  onStart={startReadAll}
                  onPause={pauseReadAll}
                  onResume={resumeReadAll}
                  onStop={stopReadAll}
                  onSkip={skipReadAllToNext}
                  skipDisabled={
                    flashcards.length < 2 ||
                    currentCardIndex >= flashcards.length - 1
                  }
                />
              </div>
              {getStoredUserId() ? (
                <div className="absolute end-1 top-0 z-10 sm:end-1.5 sm:top-0.5 landscape-mobile:end-0.5 landscape-mobile:-top-0.5">
                  <FlashcardBookmarkStar
                    bookmarked={Boolean(card.bookmarked)}
                    busy={bookmarkBusyId === card.id}
                    onToggle={() =>
                      handleBookmarkToggle(card.id, !card.bookmarked)
                    }
                  />
                </div>
              ) : null}
              <FormattedText
                text={card.question}
                className="text-2xl font-medium leading-snug sm:text-3xl sm:leading-relaxed lg:text-4xl landscape-mobile:text-2xl landscape-mobile:leading-snug"
              />
              <hr className="border-border" />
              <FormattedText
                text={buildAnswerDisplayText(
                  card.answer_short,
                  card.answer_example
                )}
                className="whitespace-pre-line text-lg leading-relaxed sm:text-2xl lg:text-[1.75rem] landscape-mobile:text-xl landscape-mobile:leading-snug"
                variant="answer"
              />
              {shouldShowAnswerDetailed(
                card.answer_detailed,
                card.answer_short,
                card.answer_example
              ) ? (
                <div className="border-l-2 border-border pl-3 sm:pl-4">
                  <FormattedText
                    text={card.answer_detailed ?? ""}
                    className="whitespace-pre-line text-base leading-relaxed text-muted-foreground sm:text-lg lg:text-xl landscape-mobile:text-base"
                    variant="answer"
                  />
                </div>
              ) : null}
            </article>
            <nav
              className="mt-5 flex items-center justify-center gap-5 pb-3 landscape-mobile:mt-4 landscape-mobile:gap-4 landscape-mobile:pb-2"
              aria-label="Card navigation"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handlePrev}
                disabled={isFirst}
                className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
                aria-label="Previous card"
              >
                <ChevronLeft className="size-5" />
              </Button>
              <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-muted-foreground">
                {currentCardIndex + 1} / {flashcards.length}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleNext}
                disabled={isLast}
                className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
                aria-label="Next card"
              >
                <ChevronRight className="size-5" />
              </Button>
            </nav>
          </div>
        </div>
      ) : (
        <div className="relative z-0 flex min-h-0 w-full min-w-0 flex-1 flex-col landscape-mobile:overflow-hidden">
            <div className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col px-3 pt-1 sm:px-6 sm:pt-2 md:px-8 landscape-mobile:px-2 landscape-mobile:pt-0">
            <div className="flex min-h-[11rem] flex-1 flex-col justify-center landscape-mobile:min-h-0">
              <div
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                dir="auto"
                className="flashcard relative mx-auto flex w-full max-w-2xl touch-pan-y flex-col overflow-hidden rounded-2xl shadow-md sm:max-w-3xl aspect-[3/2] landscape-mobile:aspect-auto landscape-mobile:max-h-[min(28rem,calc(100dvh-6.75rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)))] landscape-mobile:min-h-[11rem] landscape-mobile:w-full transition-shadow duration-200 hover:shadow-lg"
              >
                {getStoredUserId() ? (
                  <div className="pointer-events-auto absolute end-2 top-2 z-20 sm:end-3 sm:top-3">
                    <FlashcardBookmarkStar
                      bookmarked={Boolean(card.bookmarked)}
                      busy={bookmarkBusyId === card.id}
                      onToggle={() =>
                        handleBookmarkToggle(card.id, !card.bookmarked)
                      }
                      compact
                      className="bg-background/80 backdrop-blur-sm"
                    />
                  </div>
                ) : null}
                <div className="pointer-events-auto absolute start-2 top-2 z-20 sm:start-3 sm:top-3">
                  <div className="flex rounded-md bg-background/80 backdrop-blur-sm">
                    <FlashcardSpeakButton
                      className="h-8 w-8"
                      utteranceKey={`study-deck-${params.deck_id}-flip-${card.id}-${showAnswer ? "a" : "q"}`}
                      text={
                        showAnswer
                          ? buildAnswerSpeechText(
                              card.answer_short,
                              card.answer_example,
                              card.answer_detailed
                            )
                          : card.question
                      }
                      aria-label={showAnswer ? "Speak answer" : "Speak question"}
                      englishTts={userSettings.english_tts}
                      voiceStyle={userSettings.voice_style}
                      speechVoiceKey={userSettings.speech_voice}
                    />
                  </div>
                </div>
                <Flashcard
                  cardStyle={userSettings.card_style}
                  reserveBookmarkCorner={Boolean(getStoredUserId())}
                  front={
                    <div className="min-h-0 w-full flex-1 overflow-y-auto">
                      <FormattedText
                        text={card.question}
                        className="text-2xl font-medium leading-snug sm:text-3xl sm:leading-relaxed lg:text-4xl landscape-mobile:text-2xl landscape-mobile:leading-snug"
                      />
                    </div>
                  }
                  back={
                    <>
                      <div className="flex min-h-0 w-full flex-1 cursor-pointer flex-col items-stretch justify-start overflow-y-auto">
                        <FormattedText
                          text={buildAnswerDisplayText(
                            card.answer_short,
                            card.answer_example
                          )}
                          className="mt-5 whitespace-pre-line text-xl leading-relaxed sm:mt-7 sm:text-2xl lg:text-[1.75rem] landscape-mobile:mt-2 landscape-mobile:text-xl landscape-mobile:leading-snug"
                          variant="answer"
                        />
                        {shouldShowAnswerDetailed(
                          card.answer_detailed,
                          card.answer_short,
                          card.answer_example
                        ) ? (
                          <FormattedText
                            text={card.answer_detailed ?? ""}
                            className="mt-3 whitespace-pre-line text-base leading-relaxed text-muted-foreground sm:mt-4 sm:text-lg lg:text-xl landscape-mobile:mt-2 landscape-mobile:text-base landscape-mobile:leading-snug"
                            variant="answer"
                          />
                        ) : null}
                      </div>
                      {deckView === "quiz" && showAnswer && (
                        <div
                          className="flex w-full shrink-0 flex-row flex-wrap justify-center gap-1 landscape-mobile:gap-0.5 landscape-mobile:py-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            onClick={() => rateCard("again")}
                            className="shrink-0 !border-0 !bg-mondrian-red !text-white hover:!bg-mondrian-red/90 landscape-mobile:h-7 landscape-mobile:px-2 landscape-mobile:text-[11px]"
                          >
                            Again
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => rateCard("hard")}
                            className="shrink-0 !border-0 !bg-mondrian-yellow !text-mondrian-black hover:!bg-mondrian-yellow/90 landscape-mobile:h-7 landscape-mobile:px-2 landscape-mobile:text-[11px]"
                          >
                            Hard
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => rateCard("good")}
                            className="shrink-0 !border-0 !bg-mondrian-blue !text-white hover:!bg-mondrian-blue/90 landscape-mobile:h-7 landscape-mobile:px-2 landscape-mobile:text-[11px]"
                          >
                            Good
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => rateCard("easy")}
                            className="shrink-0 landscape-mobile:h-7 landscape-mobile:px-2 landscape-mobile:text-[11px]"
                          >
                            Easy
                          </Button>
                        </div>
                      )}
                    </>
                  }
                  flipped={showAnswer}
                  onFlip={() => setShowAnswer((prev) => !prev)}
                  canFlip={canFlip}
                />
              </div>
            </div>
            <nav
              className="flex shrink-0 items-center justify-center gap-5 border-t border-border/30 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] landscape-mobile:gap-4 landscape-mobile:py-1.5"
              aria-label="Card navigation"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handlePrev}
                disabled={isFirst}
                className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
                aria-label="Previous card"
              >
                <ChevronLeft className="size-5" />
              </Button>
              <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-muted-foreground">
                {currentCardIndex + 1} / {flashcards.length}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleNext}
                disabled={isLast}
                className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
                aria-label="Next card"
              >
                <ChevronRight className="size-5" />
              </Button>
            </nav>
          </div>
        </div>
      )}
    </main>
  );
}
