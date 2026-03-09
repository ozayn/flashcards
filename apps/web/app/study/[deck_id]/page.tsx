"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSwipeable } from "react-swipeable";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getFlashcards, submitReview } from "@/lib/api";
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
    setCurrentCardIndex(0);
    setShowAnswer(false);
  }, [params.deck_id]);

  const handleNext = () => {
    setShowAnswer(false);
    setCurrentCardIndex((i) => Math.min(i + 1, flashcards.length - 1));
  };

  const handlePrev = () => {
    setShowAnswer(false);
    setCurrentCardIndex((i) => Math.max(i - 1, 0));
  };

  const swipeHandlers = useSwipeable({
    onSwipedLeft: handleNext,
    onSwipedRight: handlePrev,
    trackMouse: true,
  });

  useEffect(() => {
    if (loading || flashcards.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setShowAnswer(true);
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
  }, [loading, flashcards.length, handleNext, handlePrev]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <p className="text-muted-foreground">Loading flashcards...</p>
      </main>
    );
  }

  if (flashcards.length === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
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

  const rateCard = async (rating: "again" | "hard" | "good" | "easy") => {
    const userId = getStoredUserId();
    if (userId) {
      try {
        await submitReview(card.id, rating, userId);
      } catch {
        // ignore
      }
    }
    handleNext();
  };

  return (
    <main className="h-[calc(100vh-80px)] flex flex-col px-6">
      <Link
        href={`/decks/${params.deck_id}`}
        className="self-start inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium hover:bg-muted py-4"
      >
        ← Back
      </Link>

      <div className="text-center text-sm text-muted-foreground py-4">
        Card {currentCardIndex + 1} / {flashcards.length}
      </div>

      <div className="flex-1 flex items-center justify-center min-h-0">
        <div
          {...swipeHandlers}
          className="w-full h-full flex items-center justify-center touch-pan-y"
        >
          <Card
            onClick={() => setShowAnswer(true)}
            className="w-full max-w-6xl h-full flex items-center justify-center p-12 text-center cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <div>
              <div className="text-3xl md:text-4xl lg:text-5xl font-semibold">
                {card.question}
              </div>

              {!showAnswer && (
                <div className="mt-6 text-muted-foreground">
                  Tap to reveal
                </div>
              )}

              {showAnswer && (
                <div className="mt-8">
                  <div className="text-xl md:text-2xl">
                    {card.answer_short}
                  </div>
                  {card.answer_detailed && (
                    <div className="mt-2 text-muted-foreground">
                      {card.answer_detailed}
                    </div>
                  )}
                  <div className="flex gap-3 justify-center mt-8 flex-wrap">
                    <Button
                      variant="destructive"
                      onClick={() => rateCard("again")}
                    >
                      Again
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => rateCard("hard")}
                    >
                      Hard
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => rateCard("good")}
                    >
                      Good
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => rateCard("easy")}
                    >
                      Easy
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="flex justify-center gap-4 py-6">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={isFirst}
          className="h-12 text-base"
        >
          ← Previous
        </Button>
        <Button
          variant="outline"
          onClick={handleNext}
          disabled={isLast}
          className="h-12 text-base"
        >
          Next →
        </Button>
      </div>
    </main>
  );
}
