"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { HelpCircle, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Flashcard } from "@/components/study/Flashcard";
import { getFlashcards, getUserSettings, submitReview, type UserSettings } from "@/lib/api";
import { getStoredUserId } from "@/components/user-selector";

interface StudyPageProps {
  params: { deck_id: string };
}

interface Flashcard {
  id: string;
  question: string;
  answer_short: string;
  answer_detailed?: string | null;
}

export default function StudyPage({ params }: StudyPageProps) {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings>({
    think_delay_enabled: true,
    think_delay_ms: 1500,
  });
  const [canFlip, setCanFlip] = useState(false);
  const touchStartX = useRef(0);

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
      <main className="min-h-screen flex items-center justify-center p-6 relative">
        <Link
          href={`/decks/${params.deck_id}`}
          className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full bg-background/95 backdrop-blur border border-border shadow-lg px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          <X className="size-4" />
          Exit Study
        </Link>
        <p className="text-muted-foreground">Loading flashcards...</p>
      </main>
    );
  }

  if (flashcards.length === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 relative">
        <Link
          href={`/decks/${params.deck_id}`}
          className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full bg-background/95 backdrop-blur border border-border shadow-lg px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          <X className="size-4" />
          Exit Study
        </Link>
        <Link
          href={`/decks/${params.deck_id}`}
          className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted mb-4"
        >
          ← Back
        </Link>
        <p className="text-muted-foreground text-center">
          No flashcards in this deck yet.
        </p>
        <Link
          href={`/decks/${params.deck_id}/add-card`}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Add Cards
        </Link>
      </main>
    );
  }

  const card = flashcards[currentCardIndex];
  const isFirst = currentCardIndex === 0;
  const isLast = currentCardIndex === flashcards.length - 1;

  if (sessionComplete) {
    return (
      <main className="relative h-full min-h-[50vh] flex flex-col items-center justify-center px-4 py-8">
        <Link
          href={`/decks/${params.deck_id}`}
          className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full bg-background/95 backdrop-blur border border-border shadow-lg px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          <X className="size-4" />
          Exit Study
        </Link>
        <div className="text-center space-y-6 max-w-sm">
          <h2 className="text-2xl font-semibold">Session complete!</h2>
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
              className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-background px-4 text-sm font-medium hover:bg-muted hover:text-foreground"
            >
              Back to deck
            </Link>
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
    if (isLast) {
      setSessionComplete(true);
    } else {
      handleNext();
    }
  };

  return (
    <main className="h-full min-h-0 flex flex-col items-center px-3 md:px-4 overflow-hidden relative">
      <Link
        href={`/decks/${params.deck_id}`}
        className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full bg-background/95 backdrop-blur border border-border shadow-lg px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
      >
        <X className="size-4" />
        Exit Study
      </Link>
      <div className="shrink-0 flex items-center justify-between w-full mb-0">
        <Link
          href={`/decks/${params.deck_id}`}
          className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-medium hover:bg-muted py-2"
        >
          ← Back
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {currentCardIndex + 1} / {flashcards.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHelp((h) => !h)}
            className="size-8 text-muted-foreground hover:text-foreground"
            aria-label={showHelp ? "Hide help" : "Show help"}
          >
            <HelpCircle className="size-4" />
          </Button>
        </div>
      </div>

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
          className="h-full min-h-[180px] max-h-full max-w-full aspect-[2/3] md:aspect-[3/2] landscape:aspect-[3/2] w-auto flex items-center justify-center touch-pan-y [perspective:1000px] md:min-h-0 md:max-w-2xl md:w-full flex-1 min-w-0 min-h-0 order-1 landscape:order-2 landscape:self-stretch landscape:h-full overflow-hidden"
        >
          <Flashcard
            front={
              <>
                <div className="text-xl md:text-2xl leading-relaxed font-semibold text-left w-full">
                  {card.question}
                </div>
                {showHelp && (
                  <div className="mt-4 text-muted-foreground text-xs opacity-60 text-center w-full">
                    Tap to flip
                  </div>
                )}
              </>
            }
            back={
              <>
                <div className="flex-1 min-h-0 flex flex-col items-stretch justify-start w-full text-left overflow-y-auto cursor-pointer">
                  <div className="text-xl md:text-2xl leading-relaxed font-medium">
                    {card.answer_short}
                  </div>
                  {card.answer_detailed && (
                    <div className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
                      {card.answer_detailed}
                    </div>
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

        {showHelp && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-muted-foreground opacity-60 bg-background/80 px-2 py-1 rounded border border-border">
            Tap to flip • Swipe to go
          </div>
        )}
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
    </main>
  );
}
