"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flashcard } from "@/components/study/Flashcard";
import { getFlashcards, getUserSettings, updateUserSettings, submitReview, type UserSettings } from "@/lib/api";
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

export default function StudyPage({ params }: StudyPageProps) {
  const [flashcards, setFlashcards] = useState<StudyFlashcard[]>([]);
  const [loading, setLoading] = useState(true);
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
  const touchStartX = useRef(0);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchFlashcards() {
      try {
        const data = await getFlashcards(params.deck_id);
        setFlashcards(Array.isArray(data) ? data : []);
      } catch {
        setFlashcards([]);
      } finally {
        setLoading(false);
      }
    }

    fetchFlashcards();
  }, [params.deck_id]);

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
        if (canFlip) setShowAnswer((prev) => !prev);
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
  }, [loading, flashcards.length, canFlip, handleNext, handlePrev]);

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col pt-6 pb-8" data-study>
        <div className="max-w-2xl mx-auto w-full px-10 md:px-12 flex flex-col flex-1 justify-center gap-4">
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

  if (flashcards.length === 0) {
    return (
      <main className="min-h-screen flex flex-col pt-6 pb-8" data-study>
        <div className="max-w-2xl mx-auto w-full px-10 md:px-12 flex flex-col flex-1 justify-center gap-4">
          <Link
            href={`/decks/${params.deck_id}`}
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted w-fit"
          >
            ← Back
          </Link>
          <p className="text-muted-foreground text-center">
            No flashcards in this deck yet.
          </p>
          <Link
            href={`/decks/${params.deck_id}/add-card`}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/80 w-fit"
          >
            Add Cards
          </Link>
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
        <div className="max-w-2xl mx-auto w-full px-10 md:px-12 flex flex-col flex-1 justify-center gap-6">
          <Link
            href={`/decks/${params.deck_id}`}
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted w-fit"
          >
            ← Back
          </Link>
          <Card className="max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Session complete!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              You&apos;ve gone through all {flashcards.length} cards. Great work!
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => {
                  setSessionComplete(false);
                  setCurrentCardIndex(0);
                  setShowAnswer(false);
                }}
              >
                Study again
              </Button>
              <Link
                href={`/decks/${params.deck_id}`}
                className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:bg-neutral-800"
              >
                Back to deck
              </Link>
            </div>
          </CardContent>
        </Card>
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
    if (isLast) {
      setSessionComplete(true);
    } else {
      handleNext();
    }
  };

  return (
    <main className="h-full min-h-0 flex flex-col items-center overflow-hidden relative" data-study>
      <Link
        href={`/decks/${params.deck_id}`}
        className="fixed bottom-8 right-[max(0.5rem,calc(50vw-min(50vw,18rem)))] z-50 inline-flex items-center gap-2 rounded-full bg-background/95 backdrop-blur border border-border shadow-lg px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
      >
        <X className="size-4" />
        Exit Study
      </Link>
      <div className="pt-6 shrink-0 w-full">
        <div className="max-w-2xl mx-auto w-full px-10 md:px-12 flex items-center justify-between">
          <Link
            href={`/decks/${params.deck_id}`}
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
          >
            ← Back
          </Link>
        <div className="flex items-center gap-2">
          <div className="hidden max-md:landscape:flex items-center gap-2">
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
        </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center min-h-[75vh] flex-1 min-h-0 w-full">
        <div className="flex-1 min-h-0 min-h-[200px] flex flex-col landscape:flex-row landscape:items-stretch landscape:min-h-0 justify-center gap-2 w-full max-w-4xl mx-auto relative overflow-hidden [perspective:1000px]">
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
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            dir="auto"
            className="flashcard relative rounded-2xl w-full max-w-xl aspect-[3/4] min-h-[200px] max-h-[70vh] flex-1 min-w-0 order-1 landscape:order-2 touch-pan-y overflow-hidden flex flex-col"
          >
            <div className="absolute top-6 right-6 text-sm text-muted-foreground z-10">
              {currentCardIndex + 1} / {flashcards.length}
            </div>
            <Flashcard
              cardStyle={userSettings.card_style}
              front={
                <>
                  <div className="flex-1 min-h-0 w-full overflow-y-auto">
                    <p dir="auto" className="text-2xl font-medium leading-relaxed">
                      {card.question}
                    </p>
                  </div>
                </>
              }
              back={
                <>
                  <div className="flex-1 min-h-0 flex flex-col items-stretch justify-start w-full overflow-y-auto cursor-pointer">
                    <p dir="auto" className="text-xl leading-relaxed mt-6">
                      {card.answer_short}
                    </p>
                    {card.answer_detailed && (
                      <p dir="auto" className="text-xl leading-relaxed mt-4 text-muted-foreground">
                        {card.answer_detailed}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-row gap-2 justify-center flex-wrap shrink-0 w-full" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="destructive"
                    onClick={() => rateCard("again")}
                    className="shrink-0"
                  >
                    Again
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => rateCard("hard")}
                    className="shrink-0"
                  >
                    Hard
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => rateCard("good")}
                    className="shrink-0 bg-muted/80 hover:bg-muted dark:bg-muted/50 dark:hover:bg-muted/70"
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
              </>
            }
            flipped={showAnswer}
            onFlip={() => setShowAnswer((prev) => !prev)}
            canFlip={canFlip}
          />
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
    </main>
  );
}
