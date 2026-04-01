"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, X, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Flashcard } from "@/components/study/Flashcard";
import FormattedText from "@/components/FormattedText";
import { getFlashcards, getUserSettings, updateUserSettings, submitReview, deleteDeckReviews, type UserSettings } from "@/lib/api";
import { getStoredUserId } from "@/components/user-selector";

interface StudyPageProps {
  params: { deck_id: string };
}

interface StudyFlashcard {
  id: string;
  question: string;
  answer_short: string;
  answer_detailed?: string | null;
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
  });
  const [canFlip, setCanFlip] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const touchStartX = useRef(0);
  const settingsRef = useRef<HTMLDivElement>(null);

  const isDev = process.env.NODE_ENV === "development";

  async function handleResetProgress() {
    const userId = getStoredUserId();
    if (!userId) return;
    setResetLoading(true);
    try {
      await deleteDeckReviews(params.deck_id, userId);
      setResetConfirmOpen(false);
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
      try {
        const data = await getFlashcards(params.deck_id, {
          dueOnly,
          userId: dueOnly ? userId ?? undefined : undefined,
        });
        setFlashcards(Array.isArray(data) ? data : []);
      } catch {
        setFlashcards([]);
      } finally {
        setLoading(false);
      }
    }

    fetchFlashcards();
  }, [params.deck_id, deckView, userChangeKey]);

  useEffect(() => {
    const handleUserChanged = () => setUserChangeKey((k) => k + 1);
    window.addEventListener("flashcard_user_changed", handleUserChanged);
    return () => window.removeEventListener("flashcard_user_changed", handleUserChanged);
  }, []);

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
    setCurrentCardIndex(0);
    setShowAnswer(false);
    setSessionComplete(false);
  }, [params.deck_id]);

  useEffect(() => {
    setCurrentCardIndex(0);
    setShowAnswer(false);
    setSessionComplete(false);
  }, [deckView]);

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
    setShowAnswer(false);
    setCurrentCardIndex((i) => Math.min(i + 1, flashcards.length - 1));
  }, [flashcards.length]);

  const handlePrev = useCallback(() => {
    setShowAnswer(false);
    setCurrentCardIndex((i) => Math.max(i - 1, 0));
  }, []);

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
    if (!showSettings) return;
    function handleClickOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSettings]);

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
            <Button variant="outline" onClick={() => setDeckView("cards")} className="w-fit">
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
                You&apos;re all caught up! No cards are due for quiz.
              </p>
              <Button variant="outline" onClick={() => setDeckView("cards")} className="w-fit">
                Browse all cards
              </Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-center">
                No flashcards in this deck yet.
              </p>
              <Link
                href={`/decks/${params.deck_id}/add-card`}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-5 text-sm font-medium w-fit"
              >
                Add Cards
              </Link>
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
      <div className="pt-3 sm:pt-4 landscape-mobile:py-1 shrink-0 w-full landscape-mobile:border-b landscape-mobile:border-border/50">
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 landscape-mobile:px-2">
          {/* Mobile landscape: single compact control band */}
          <div className="hidden landscape-mobile:flex landscape-mobile:items-center landscape-mobile:gap-1.5 landscape-mobile:min-h-8 landscape-mobile:max-h-9">
            <Link
              href={`/decks/${params.deck_id}`}
              className="inline-flex h-7 shrink-0 items-center justify-center rounded-md px-1.5 text-[11px] font-medium hover:bg-muted"
            >
              ← Back
            </Link>
            <div
              className="flex min-w-0 flex-1 items-center justify-center gap-0.5 rounded-md border border-border/60 p-0.5 bg-muted/20"
              role="tablist"
              aria-label="Deck view"
            >
              {(["read", "cards", "quiz"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={deckView === v}
                  onClick={() => setDeckView(v)}
                  className={`shrink-0 px-1.5 py-0.5 min-h-[26px] rounded text-[11px] font-medium leading-none transition-colors ${
                    deckView === v
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v === "read" ? "Read" : v === "cards" ? "Cards" : "Quiz"}
                </button>
              ))}
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {currentCardIndex + 1}/{flashcards.length}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <ThemeToggle className="size-6 text-muted-foreground hover:text-foreground [&_svg]:size-3.5" />
              <div ref={settingsRef} className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSettings((s) => !s)}
                  className="size-6 text-muted-foreground hover:text-foreground"
                  aria-label="Flashcard style"
                >
                  <Settings className="size-3.5" />
                </Button>
                {showSettings && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-border bg-popover p-2 shadow-lg">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Style</p>
                    <div className="grid grid-cols-2 gap-1">
                      {(["paper", "minimal", "modern", "anki"] as const).map((style) => (
                        <button
                          key={style}
                          type="button"
                          onClick={async () => {
                            const userId = getStoredUserId();
                            if (userId) {
                              const updated = await updateUserSettings(userId, { card_style: style });
                              setUserSettings(updated);
                              setShowSettings(false);
                            }
                          }}
                          className={`px-2 py-1 rounded text-xs font-medium capitalize ${userSettings.card_style === style ? "bg-accent" : "hover:bg-muted"}`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Link
                href={`/decks/${params.deck_id}`}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground shadow-sm hover:bg-muted"
                aria-label="Exit to deck"
              >
                <X className="size-3 shrink-0" />
                Exit
              </Link>
              {isDev && (
                <button
                  type="button"
                  onClick={() => setResetConfirmOpen(true)}
                  className="px-1 py-0.5 text-[10px] text-muted-foreground hover:text-foreground rounded hover:bg-muted/70"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Portrait & taller landscape: two-row chrome */}
          <div className="space-y-2 landscape-mobile:hidden">
            <div className="flex items-center justify-between">
              <Link
                href={`/decks/${params.deck_id}`}
                className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
              >
                ← Back
              </Link>
              <div className="flex items-center gap-2" />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div
                className="flex items-center gap-0.5 rounded-lg border border-border/60 p-0.5 bg-muted/20"
                role="tablist"
                aria-label="Deck view"
              >
                {(["read", "cards", "quiz"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={deckView === v}
                    onClick={() => setDeckView(v)}
                    className={`px-2.5 sm:px-3 py-1 min-h-[32px] rounded-md text-sm font-medium transition-colors ${
                      deckView === v
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v === "read" ? "Read" : v === "cards" ? "Cards" : "Quiz"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {deckView === "read" ? (
        <div
          ref={readScrollRef}
          className="flex-1 min-h-0 w-full overflow-y-auto touch-pan-y landscape-mobile:min-h-0"
        >
          <div className="max-w-2xl sm:max-w-3xl mx-auto w-full px-5 sm:px-6 md:px-8 py-6 sm:py-10 landscape-mobile:py-2 landscape-mobile:px-3">
            <article dir="auto" className="space-y-5 sm:space-y-8 landscape-mobile:space-y-2">
              <FormattedText
                text={card.question}
                className="text-2xl sm:text-3xl lg:text-4xl font-medium leading-snug sm:leading-relaxed landscape-mobile:text-2xl landscape-mobile:leading-snug"
              />
              <hr className="border-border landscape-mobile:my-0" />
              <FormattedText
                text={card.answer_short}
                className="whitespace-pre-line text-lg sm:text-2xl lg:text-[1.75rem] leading-relaxed landscape-mobile:text-xl landscape-mobile:leading-snug"
              />
              {card.answer_detailed &&
                card.answer_detailed.trim() !== card.answer_short.trim() && (
                  <div className="border-l-2 border-border pl-4 sm:pl-5 landscape-mobile:pl-3">
                    <FormattedText
                      text={card.answer_detailed}
                      className="whitespace-pre-line text-base sm:text-lg lg:text-xl text-muted-foreground leading-relaxed landscape-mobile:text-base landscape-mobile:leading-snug"
                    />
                  </div>
                )}
            </article>
            <div className="flex items-center justify-center gap-4 mt-8 sm:mt-10 pb-4 landscape-mobile:hidden">
              {!isFirst ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePrev}
                  className="hidden sm:inline-flex h-10 w-10 lg:h-12 lg:w-12 shrink-0"
                  aria-label="Previous card"
                >
                  <ChevronLeft className="size-5 lg:size-6" />
                </Button>
              ) : (
                <span className="hidden sm:inline-block w-10 lg:w-12 shrink-0" aria-hidden />
              )}
              <span className="text-sm text-muted-foreground tabular-nums text-center min-w-[4.5rem]">
                {currentCardIndex + 1} / {flashcards.length}
              </span>
              {!isLast ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleNext}
                  className="hidden sm:inline-flex h-10 w-10 lg:h-12 lg:w-12 shrink-0"
                  aria-label="Next card"
                >
                  <ChevronRight className="size-5 lg:size-6" />
                </Button>
              ) : (
                <span className="hidden sm:inline-block w-10 lg:w-12 shrink-0" aria-hidden />
              )}
            </div>
          </div>
        </div>
      ) : (
      <div className="flex flex-col flex-1 min-h-0 w-full min-w-0 landscape-mobile:overflow-hidden">
        <div className="flex flex-1 min-h-0 flex flex-col justify-center items-stretch max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 py-2 sm:py-3 min-h-0 landscape-mobile:justify-start landscape-mobile:py-0 landscape-mobile:px-2">
        <div className="flex flex-1 min-h-0 min-h-[160px] landscape-mobile:min-h-0 flex flex-col landscape:flex-row landscape:items-center landscape-mobile:items-stretch landscape:min-h-0 justify-center items-center gap-2 landscape:gap-3 landscape-mobile:gap-1 w-full relative overflow-hidden [perspective:1000px]">
          {!isFirst ? (
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrev}
              className="hidden landscape:flex landscape-mobile:!hidden h-10 w-10 shrink-0 order-2 landscape:order-1"
              aria-label="Previous card"
            >
              <ChevronLeft className="size-5" />
            </Button>
          ) : (
            <span className="hidden landscape:block landscape-mobile:!hidden w-10 shrink-0 order-2 landscape:order-1" aria-hidden />
          )}
          <div className="flex justify-center items-center landscape-mobile:items-stretch flex-1 min-w-0 w-full order-1 landscape:order-2 px-2 min-h-0 landscape-mobile:px-0.5 landscape-mobile:min-h-0">
            <div className="relative flex h-full min-h-0 w-full max-w-2xl sm:max-w-3xl mx-auto flex-col landscape-mobile:h-full landscape-mobile:min-h-0 landscape-mobile:self-stretch landscape-mobile:max-h-full landscape-mobile:max-w-none landscape-mobile:w-full landscape-mobile:flex-row landscape-mobile:items-center landscape-mobile:justify-center landscape-mobile:gap-1">
              {/* Mobile landscape: arrows beside the card (not on the card) */}
              <div className="hidden landscape-mobile:flex w-9 shrink-0 items-center justify-center self-stretch">
                {!isFirst ? (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePrev}
                    className="h-9 w-9 shrink-0 rounded-full border-border/80 bg-background shadow-sm"
                    aria-label="Previous card"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                ) : (
                  <span className="inline-block h-9 w-9 shrink-0" aria-hidden />
                )}
              </div>

              <div className="relative flex min-h-0 w-full flex-1 flex-col justify-center landscape-mobile:min-h-0 landscape-mobile:min-w-0 landscape-mobile:max-w-[min(100%,36rem)]">
                <div
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                  dir="auto"
                  className="flashcard relative w-full aspect-[3/2] landscape-mobile:aspect-auto landscape-mobile:h-[calc(100dvh-2.85rem-env(safe-area-inset-top,0px))] landscape-mobile:max-h-[calc(100dvh-2.85rem-env(safe-area-inset-top,0px))] landscape-mobile:min-h-[10rem] landscape-mobile:shrink-0 rounded-2xl shadow-lg overflow-hidden flex flex-col touch-pan-y transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-xl hover:rotate-[0.3deg] active:translate-y-0 active:shadow-md landscape-mobile:hover:translate-y-0 landscape-mobile:hover:rotate-0"
                >
                  <div className="absolute top-6 right-6 text-sm text-muted-foreground z-10 landscape-mobile:hidden">
                    {currentCardIndex + 1} / {flashcards.length}
                  </div>
                  <Flashcard
                    cardStyle={userSettings.card_style}
                    front={
                      <>
                        <div className="flex-1 min-h-0 w-full overflow-y-auto">
                          <FormattedText
                            text={card.question}
                            className="text-2xl sm:text-3xl lg:text-4xl font-medium leading-snug sm:leading-relaxed landscape-mobile:text-2xl landscape-mobile:leading-snug"
                          />
                        </div>
                      </>
                    }
                    back={
                      <>
                        <div className="flex-1 min-h-0 flex flex-col items-stretch justify-start w-full overflow-y-auto cursor-pointer">
                          <FormattedText
                            text={card.answer_short}
                            className="whitespace-pre-line text-xl sm:text-2xl lg:text-[1.75rem] leading-relaxed mt-6 sm:mt-8 landscape-mobile:mt-1 landscape-mobile:text-xl landscape-mobile:leading-snug"
                          />
                          {card.answer_detailed &&
                            card.answer_detailed.trim() !== card.answer_short.trim() && (
                              <FormattedText
                                text={card.answer_detailed}
                                className="whitespace-pre-line text-base sm:text-lg lg:text-xl text-muted-foreground mt-4 sm:mt-5 landscape-mobile:mt-1.5 landscape-mobile:text-base landscape-mobile:leading-snug"
                              />
                            )}
                        </div>
                        {deckView === "quiz" && showAnswer && (
                          <div
                            className="flex flex-row gap-1 landscape-mobile:gap-0.5 justify-center flex-wrap shrink-0 w-full landscape-mobile:py-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              onClick={() => rateCard("again")}
                              className="shrink-0 !bg-mondrian-red !text-white hover:!bg-mondrian-red/90 border-0 landscape-mobile:h-7 landscape-mobile:px-2 landscape-mobile:text-[11px]"
                            >
                              Again
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => rateCard("hard")}
                              className="shrink-0 !bg-mondrian-yellow !text-mondrian-black hover:!bg-mondrian-yellow/90 border-0 landscape-mobile:h-7 landscape-mobile:px-2 landscape-mobile:text-[11px]"
                            >
                              Hard
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => rateCard("good")}
                              className="shrink-0 !bg-mondrian-blue !text-white hover:!bg-mondrian-blue/90 border-0 landscape-mobile:h-7 landscape-mobile:px-2 landscape-mobile:text-[11px]"
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
                  {/* Portrait only: midline arrows on the card; tall landscape uses outer row side buttons */}
                  <div className="hidden portrait:flex absolute inset-0 z-20 items-center justify-between pointer-events-none">
                    <div className="pointer-events-auto flex w-11 justify-start pl-0.5">
                      {!isFirst ? (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={handlePrev}
                          className="h-10 w-10 shrink-0 rounded-full border-border/80 bg-background/95 shadow-sm backdrop-blur-sm"
                          aria-label="Previous card"
                        >
                          <ChevronLeft className="size-5" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="pointer-events-auto flex w-11 justify-end pr-0.5">
                      {!isLast ? (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={handleNext}
                          className="h-10 w-10 shrink-0 rounded-full border-border/80 bg-background/95 shadow-sm backdrop-blur-sm"
                          aria-label="Next card"
                        >
                          <ChevronRight className="size-5" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden landscape-mobile:flex w-9 shrink-0 items-center justify-center self-stretch">
                {!isLast ? (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleNext}
                    className="h-9 w-9 shrink-0 rounded-full border-border/80 bg-background shadow-sm"
                    aria-label="Next card"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                ) : (
                  <span className="inline-block h-9 w-9 shrink-0" aria-hidden />
                )}
              </div>
            </div>
          </div>

          {!isLast ? (
            <Button
              variant="outline"
              size="icon"
              onClick={handleNext}
              className="hidden landscape:flex landscape-mobile:!hidden h-10 w-10 shrink-0 order-3"
              aria-label="Next card"
            >
              <ChevronRight className="size-5" />
            </Button>
          ) : (
            <span className="hidden landscape:block landscape-mobile:!hidden w-10 shrink-0 order-3" aria-hidden />
          )}
        </div>
        </div>
        <div className="shrink-0 max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 mt-1 border-t border-border/50 flex flex-wrap items-center justify-end gap-2 landscape-mobile:hidden">
          <Link
            href={`/decks/${params.deck_id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
          >
            <X className="size-4 shrink-0" />
            Exit
          </Link>
          {isDev && (
            <button
              type="button"
              onClick={() => setResetConfirmOpen(true)}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md hover:bg-muted/70 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      )}
    </main>
  );
}
