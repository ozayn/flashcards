"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
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

type StudyMode = "study" | "explore";
type ExploreView = "read" | "cards";

export default function StudyPage({ params }: StudyPageProps) {
  const [mode, setMode] = useState<StudyMode>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      if (p.get("mode") === "explore") return "explore";
    }
    return "study";
  });
  const [exploreView, setExploreView] = useState<ExploreView>("read");
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
      const dueOnly = mode === "study";
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
  }, [params.deck_id, mode, userChangeKey]);

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
  }, [mode]);

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

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (diff > 60) handlePrev();
    if (diff < -60) handleNext();
  }


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
        if (mode === "explore" && exploreView === "read") {
          handleNext();
        } else if (canFlip) {
          setShowAnswer((prev) => !prev);
        }
      }
      if (e.code === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loading, flashcards.length, canFlip, handleNext, handlePrev, mode, exploreView]);

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
            No user selected. Please choose a user to start studying.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/decks"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-5 text-sm font-medium w-fit"
            >
              Choose user
            </Link>
            <Button
              variant="outline"
              onClick={() => setMode("explore")}
              className="w-fit"
            >
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
          {mode === "study" ? (
            <>
              <p className="text-muted-foreground text-center">
                You&apos;re all caught up! No cards are due for review.
              </p>
              <Button
                variant="outline"
                onClick={() => setMode("explore")}
                className="w-fit"
              >
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
              <p className="text-muted-foreground">
                All {flashcards.length} cards reviewed.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={() => {
                    setSessionComplete(false);
                    setCurrentCardIndex(0);
                    setShowAnswer(false);
                  }}
                >
                  Review again
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
    <main className="h-full min-h-0 flex flex-col items-center overflow-hidden relative" data-study>
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
      <Link
        href={`/decks/${params.deck_id}`}
        className="fixed bottom-8 right-[max(0.5rem,calc(50vw-min(50vw,18rem)))] z-50 inline-flex items-center gap-2 rounded-full bg-background/95 backdrop-blur border border-border shadow-lg px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
      >
        <X className="size-4" />
        Exit
      </Link>
      <div className="pt-4 sm:pt-6 shrink-0 w-full">
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 space-y-2">
          <div className="flex items-center justify-between">
            <Link
              href={`/decks/${params.deck_id}`}
              className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
            >
              ← Back
            </Link>
            <div className="flex items-center gap-2">
              <div className="hidden landscape-mobile:flex items-center gap-2">
                <ThemeToggle className="size-8 text-muted-foreground hover:text-foreground" />
                <div ref={settingsRef} className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowSettings((s) => !s)}
                    className="size-8 text-muted-foreground hover:text-foreground"
                    aria-label="Flashcard style"
                  >
                    <Settings className="size-4" />
                  </Button>
                  {showSettings && (
                    <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-border bg-popover p-2 shadow-lg">
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
              </div>
              {isDev && (
                <button
                  type="button"
                  onClick={() => setResetConfirmOpen(true)}
                  className="text-xs px-2 py-1 rounded border border-red-400 text-red-500 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-950/50 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {mode === "explore" ? (
              <>
                <div className="flex items-center gap-0.5 rounded-lg border border-border/60 p-0.5 bg-muted/20">
                  <button
                    type="button"
                    onClick={() => setExploreView("read")}
                    className={`px-3 py-1 min-h-[32px] rounded-md text-sm font-medium transition-colors ${
                      exploreView === "read"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Read
                  </button>
                  <button
                    type="button"
                    onClick={() => setExploreView("cards")}
                    className={`px-3 py-1 min-h-[32px] rounded-md text-sm font-medium transition-colors ${
                      exploreView === "cards"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Cards
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setMode("study")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Switch to Review
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setMode("explore")}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Switch to Explore
              </button>
            )}
          </div>
        </div>
      </div>

      {mode === "explore" && exploreView === "read" ? (
        <div className="flex-1 min-h-0 w-full overflow-y-auto">
          <div className="max-w-2xl sm:max-w-3xl mx-auto w-full px-5 sm:px-6 md:px-8 py-6 sm:py-10">
            <div className="flex items-center justify-between mb-5 sm:mb-8">
              <span className="text-sm text-muted-foreground tabular-nums">
                {currentCardIndex + 1} / {flashcards.length}
              </span>
              <div className="hidden sm:flex gap-2">
                <Button variant="outline" size="icon" onClick={handlePrev} disabled={isFirst} className="h-9 w-9" aria-label="Previous card">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={handleNext} disabled={isLast} className="h-9 w-9" aria-label="Next card">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
            <article dir="auto" className="space-y-5 sm:space-y-8" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
              <FormattedText
                text={card.question}
                className="text-2xl sm:text-3xl lg:text-4xl font-medium leading-snug sm:leading-relaxed"
              />
              <hr className="border-border" />
              <FormattedText
                text={card.answer_short}
                className="whitespace-pre-line text-lg sm:text-2xl lg:text-[1.75rem] leading-relaxed"
              />
              {card.answer_detailed &&
                card.answer_detailed.trim() !== card.answer_short.trim() && (
                  <div className="border-l-2 border-border pl-4 sm:pl-5">
                    <FormattedText
                      text={card.answer_detailed}
                      className="whitespace-pre-line text-base sm:text-lg lg:text-xl text-muted-foreground leading-relaxed"
                    />
                  </div>
                )}
            </article>
            <div className="flex justify-center gap-4 mt-8 sm:mt-10 pb-4">
              <Button variant="outline" size="icon" onClick={handlePrev} disabled={isFirst} className="h-11 w-11 sm:h-10 sm:w-10 lg:h-12 lg:w-12" aria-label="Previous card">
                <ChevronLeft className="size-5 lg:size-6" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleNext} disabled={isLast} className="h-11 w-11 sm:h-10 sm:w-10 lg:h-12 lg:w-12" aria-label="Next card">
                <ChevronRight className="size-5 lg:size-6" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
      <div className="flex flex-col items-center justify-center min-h-[75vh] flex-1 min-h-0 w-full">
        <div className="flex-1 min-h-0 min-h-[200px] flex flex-col landscape:flex-row landscape:items-stretch landscape:min-h-0 justify-center items-center gap-2 w-full max-w-4xl mx-auto relative overflow-hidden [perspective:1000px]">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrev}
            disabled={isFirst}
            className="hidden landscape:flex h-10 w-10 shrink-0 order-2 landscape:order-1"
            aria-label="Previous card"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <div className="flex justify-center items-center flex-1 min-w-0 w-full order-1 landscape:order-2 px-2">
            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              dir="auto"
              className="flashcard relative w-full max-w-2xl sm:max-w-3xl aspect-[3/2] rounded-2xl shadow-lg overflow-hidden flex flex-col touch-pan-y transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-xl hover:rotate-[0.3deg] active:translate-y-0 active:shadow-md"
            >
            <div className="absolute top-6 right-6 text-sm text-muted-foreground z-10">
              {currentCardIndex + 1} / {flashcards.length}
            </div>
            <Flashcard
              cardStyle={userSettings.card_style}
              front={
                <>
                  <div className="flex-1 min-h-0 w-full overflow-y-auto">
                    <FormattedText
                      text={card.question}
                      className="text-2xl sm:text-3xl lg:text-4xl font-medium leading-snug sm:leading-relaxed"
                    />
                  </div>
                </>
              }
              back={
                <>
                  <div className="flex-1 min-h-0 flex flex-col items-stretch justify-start w-full overflow-y-auto cursor-pointer">
                    <FormattedText
                      text={card.answer_short}
                      className="whitespace-pre-line text-xl sm:text-2xl lg:text-[1.75rem] leading-relaxed mt-6 sm:mt-8"
                    />
                    {card.answer_detailed &&
                      card.answer_detailed.trim() !== card.answer_short.trim() && (
                        <FormattedText
                          text={card.answer_detailed}
                          className="whitespace-pre-line text-base sm:text-lg lg:text-xl text-muted-foreground mt-4 sm:mt-5"
                        />
                      )}
                  </div>
                  {mode === "study" && showAnswer && (
                    <div className="flex flex-row gap-2 justify-center flex-wrap shrink-0 w-full" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        onClick={() => rateCard("again")}
                        className="shrink-0 !bg-mondrian-red !text-white hover:!bg-mondrian-red/90 border-0"
                      >
                        Again
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => rateCard("hard")}
                        className="shrink-0 !bg-mondrian-yellow !text-mondrian-black hover:!bg-mondrian-yellow/90 border-0"
                      >
                        Hard
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => rateCard("good")}
                        className="shrink-0 !bg-mondrian-blue !text-white hover:!bg-mondrian-blue/90 border-0"
                      >
                        Good
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => rateCard("easy")}
                        className="shrink-0"
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

        <Button
          variant="outline"
          size="icon"
          onClick={handleNext}
          disabled={isLast}
          className="hidden landscape:flex h-10 w-10 shrink-0 order-3"
          aria-label="Next card"
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>

      <div className="shrink-0 flex justify-center gap-4 mt-2 pb-2 landscape:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={handlePrev}
          disabled={isFirst}
          className="h-10 w-10 shrink-0 lg:h-12 lg:w-12"
          aria-label="Previous card"
        >
          <ChevronLeft className="size-5 lg:size-6" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleNext}
          disabled={isLast}
          className="h-10 w-10 shrink-0 lg:h-12 lg:w-12"
          aria-label="Next card"
        >
          <ChevronRight className="size-5 lg:size-6" />
        </Button>
      </div>
      </div>
      )}
    </main>
  );
}
