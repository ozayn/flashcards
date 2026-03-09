"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSwipeable } from "react-swipeable";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";

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
        const res = await fetch(
          `${apiUrl}/decks/${params.deck_id}/flashcards`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const data = await res.json();
          setFlashcards(Array.isArray(data) ? data : []);
        }
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

  return (
    <main className="h-[calc(100vh-80px)] flex flex-col items-center px-6">
      <Link
        href={`/decks/${params.deck_id}`}
        className="self-start inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium hover:bg-muted mb-4"
      >
        ← Back
      </Link>

      <div className="text-center text-sm text-muted-foreground mb-4">
        Card {currentCardIndex + 1} / {flashcards.length}
      </div>

      <div className="flex-1 w-full flex items-center justify-center min-h-0">
        <div
          {...swipeHandlers}
          className="w-full h-full max-w-5xl flex items-center justify-center touch-pan-y"
        >
          <button
            type="button"
            onClick={() => setShowAnswer(true)}
            className="w-full h-full flex items-center justify-center text-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
            aria-label={showAnswer ? "Answer revealed" : "Tap to reveal answer"}
          >
            <Card className="w-full h-full max-w-5xl flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
              <CardContent className="p-12 flex flex-col items-center justify-center text-center h-full">
                <p className="text-3xl md:text-4xl lg:text-5xl font-semibold">{card.question}</p>
                {showAnswer ? (
                  <>
                    <p className="text-xl md:text-2xl lg:text-3xl mt-4">{card.answer_short}</p>
                    {card.answer_detailed && (
                      <p className="text-muted-foreground mt-2">
                        {card.answer_detailed}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground mt-4">Tap to reveal</p>
                )}
              </CardContent>
            </Card>
          </button>
        </div>
      </div>

      <div className="w-full max-w-4xl flex justify-center gap-4 mt-4 pb-4">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={isFirst}
          className="flex-1 min-w-[150px] h-12 text-base"
        >
          Previous Card
        </Button>
        <Button
          variant="outline"
          onClick={handleNext}
          disabled={isLast}
          className="flex-1 min-w-[150px] h-12 text-base"
        >
          Next Card
        </Button>
      </div>
    </main>
  );
}
