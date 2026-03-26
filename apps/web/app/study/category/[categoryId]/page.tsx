"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flashcard } from "@/components/study/Flashcard";
import FormattedText from "@/components/FormattedText";
import {
  getCategoryDecks,
  getCategories,
  getDecks,
  getFlashcards,
  getUserSettings,
  submitReview,
  type UserSettings,
} from "@/lib/api";
import { getStoredUserId } from "@/components/user-selector";

interface CategoryStudyPageProps {
  params: { categoryId: string };
}

interface StudyDeck {
  id: string;
  name: string;
  card_count: number;
}

interface StudyFlashcard {
  id: string;
  question: string;
  answer_short: string;
  answer_detailed?: string | null;
}

interface NextCategoryInfo {
  id: string;
  name: string;
}

export default function CategoryStudyPage({ params }: CategoryStudyPageProps) {
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [nextCategory, setNextCategory] = useState<NextCategoryInfo | null>(null);
  const [decks, setDecks] = useState<StudyDeck[]>([]);
  const [currentDeckIndex, setCurrentDeckIndex] = useState(0);
  const [flashcards, setFlashcards] = useState<StudyFlashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [deckComplete, setDeckComplete] = useState(false);
  const [categoryComplete, setCategoryComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [noUser, setNoUser] = useState(false);
  const [totalCardsStudied, setTotalCardsStudied] = useState(0);
  const [canFlip, setCanFlip] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings>({
    think_delay_enabled: true,
    think_delay_ms: 1500,
    card_style: "paper",
  });
  const touchStartX = useRef(0);

  useEffect(() => {
    const userId = getStoredUserId();
    if (!userId) {
      setNoUser(true);
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const [deckData, categories, allDecks] = await Promise.all([
          getCategoryDecks(params.categoryId, userId!),
          getCategories(userId!),
          getDecks(userId!),
        ]);
        const deckList: StudyDeck[] = Array.isArray(deckData) ? deckData : [];
        setDecks(deckList);

        const catList = (categories ?? []) as { id: string; name: string }[];
        const currentCat = catList.find((c) => c.id === params.categoryId);
        setCategoryName(currentCat?.name ?? null);

        const deckArray = (Array.isArray(allDecks) ? allDecks : []) as { category_id?: string | null }[];
        const catIdsWithDecks = new Set(
          deckArray.map((d) => d.category_id).filter(Boolean) as string[]
        );
        const currentIdx = catList.findIndex((c) => c.id === params.categoryId);
        let next: NextCategoryInfo | null = null;
        for (let i = 1; i < catList.length; i++) {
          const candidate = catList[(currentIdx + i) % catList.length];
          if (candidate.id !== params.categoryId && catIdsWithDecks.has(candidate.id)) {
            next = { id: candidate.id, name: candidate.name };
            break;
          }
        }
        setNextCategory(next);
      } catch {
        setDecks([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.categoryId]);

  useEffect(() => {
    const userId = getStoredUserId();
    if (userId) {
      getUserSettings(userId)
        .then(setUserSettings)
        .catch(() => {});
    }
  }, []);

  const loadDeckCards = useCallback(
    async (deckId: string) => {
      setCardsLoading(true);
      setCurrentCardIndex(0);
      setShowAnswer(false);
      setDeckComplete(false);
      const userId = getStoredUserId();
      try {
        const data = await getFlashcards(deckId, {
          dueOnly: true,
          userId: userId ?? undefined,
        });
        setFlashcards(Array.isArray(data) ? data : []);
      } catch {
        setFlashcards([]);
      } finally {
        setCardsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (decks.length > 0 && currentDeckIndex < decks.length && !categoryComplete) {
      loadDeckCards(decks[currentDeckIndex].id);
    }
  }, [decks, currentDeckIndex, categoryComplete, loadDeckCards]);

  useEffect(() => {
    if (cardsLoading || flashcards.length === 0 || deckComplete || categoryComplete)
      return;
    if (!userSettings.think_delay_enabled) {
      setCanFlip(true);
      return;
    }
    setCanFlip(false);
    const t = setTimeout(
      () => setCanFlip(true),
      userSettings.think_delay_ms
    );
    return () => clearTimeout(t);
  }, [
    cardsLoading,
    flashcards.length,
    deckComplete,
    categoryComplete,
    currentCardIndex,
    userSettings.think_delay_enabled,
    userSettings.think_delay_ms,
  ]);

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
    if (cardsLoading || flashcards.length === 0) return;
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
  }, [cardsLoading, flashcards.length, canFlip, handleNext, handlePrev]);

  function advanceToNextDeck() {
    const next = currentDeckIndex + 1;
    if (next >= decks.length) {
      setCategoryComplete(true);
    } else {
      setCurrentDeckIndex(next);
    }
  }

  function handleSkipDeck() {
    advanceToNextDeck();
  }

  const rateCard = async (rating: "again" | "hard" | "good" | "easy") => {
    const userId = getStoredUserId();
    const card = flashcards[currentCardIndex];
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
    const isLast = currentCardIndex === flashcards.length - 1;
    if (isLast && rating !== "again") {
      setTotalCardsStudied((n) => n + flashcards.length);
      setDeckComplete(true);
    } else {
      setCurrentCardIndex((i) => i + 1);
    }
  };

  const backHref = "/decks";
  const currentDeck = decks[currentDeckIndex] as StudyDeck | undefined;

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col pt-4 sm:pt-6 pb-8" data-study>
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 flex flex-col flex-1 justify-center gap-4">
          <Link
            href={backHref}
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted w-fit"
          >
            ← Back
          </Link>
          <p className="text-muted-foreground">Loading category...</p>
        </div>
      </main>
    );
  }

  if (noUser) {
    return (
      <main className="min-h-screen flex flex-col pt-4 sm:pt-6 pb-8" data-study>
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 flex flex-col flex-1 justify-center gap-4">
          <CategoryHeader backHref={backHref} categoryName={categoryName} />
          <p className="text-muted-foreground text-center">
            No user selected. Please choose a user to start studying.
          </p>
          <div className="flex justify-center">
            <Link
              href="/decks"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-6 text-sm font-medium active:opacity-80"
            >
              Choose user
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (decks.length === 0) {
    return (
      <main className="min-h-screen flex flex-col pt-4 sm:pt-6 pb-8" data-study>
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 flex flex-col flex-1 justify-center gap-4">
          <CategoryHeader backHref={backHref} categoryName={categoryName} />
          <p className="text-muted-foreground text-center">
            This category has no decks yet. Add some decks to start studying.
          </p>
          <div className="flex justify-center">
            <Link
              href="/decks"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-6 text-sm font-medium active:opacity-80"
            >
              Back to decks
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (categoryComplete) {
    return (
      <main className="h-full min-h-[50vh] flex flex-col pt-4 sm:pt-6 pb-8" data-study>
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 flex flex-col flex-1">
          <CategoryHeader backHref={backHref} categoryName={categoryName} />
          <div className="flex flex-1 w-full justify-center items-center mt-4 sm:mt-6">
            <Card className="max-w-xl w-full mx-2 sm:mx-0">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="size-7 text-green-500 shrink-0" />
                  <div>
                    <CardTitle className="text-2xl">Category complete!</CardTitle>
                    {categoryName && (
                      <p className="text-sm text-muted-foreground mt-1">{categoryName}</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-muted-foreground">
                  You&apos;ve reviewed all {decks.length} deck{decks.length !== 1 ? "s" : ""} in this
                  category.
                  {totalCardsStudied > 0 && (
                    <> {totalCardsStudied} card{totalCardsStudied !== 1 ? "s" : ""} reviewed total.</>
                  )}
                </p>
                <div className="flex flex-col gap-3 items-center w-full">
                  {nextCategory && (
                    <div className="w-full flex flex-col items-center gap-1">
                      <Link
                        href={`/study/category/${nextCategory.id}`}
                        className="inline-flex h-11 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-6 text-sm font-medium active:opacity-80 w-full sm:w-auto"
                      >
                        Review next category
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        Next: {nextCategory.name}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3 justify-center w-full sm:w-auto">
                    <Button
                      variant="outline"
                      className="h-11 w-full sm:w-auto active:opacity-80"
                      onClick={() => {
                        setCategoryComplete(false);
                        setCurrentDeckIndex(0);
                        setTotalCardsStudied(0);
                      }}
                    >
                      Review category again
                    </Button>
                    <Link
                      href="/decks"
                      className="inline-flex h-11 items-center justify-center rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium hover:bg-neutral-50 active:opacity-80 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:bg-neutral-800 w-full sm:w-auto"
                    >
                      Back to decks
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    );
  }

  if (cardsLoading) {
    return (
      <main className="min-h-screen flex flex-col pt-4 sm:pt-6 pb-8" data-study>
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 flex flex-col flex-1 justify-center gap-4">
          <CategoryHeader
            backHref={backHref}
            categoryName={categoryName}
            currentDeckIndex={currentDeckIndex}
            totalDecks={decks.length}
            deckName={currentDeck?.name}
          />
          <p className="text-muted-foreground text-center">Loading cards...</p>
        </div>
      </main>
    );
  }

  if (flashcards.length === 0 && !deckComplete) {
    return (
      <main className="min-h-screen flex flex-col pt-4 sm:pt-6 pb-8" data-study>
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 flex flex-col flex-1 justify-center gap-4">
          <CategoryHeader
            backHref={backHref}
            categoryName={categoryName}
            currentDeckIndex={currentDeckIndex}
            totalDecks={decks.length}
            deckName={currentDeck?.name}
          />
          <p className="text-muted-foreground text-center">
            No cards due in <span className="font-medium text-foreground">{currentDeck?.name}</span>.
          </p>
          <div className="flex justify-center">
            <Button className="h-11 active:opacity-80" onClick={handleSkipDeck}>
              {currentDeckIndex < decks.length - 1 ? "Next deck" : "Finish category"}
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (deckComplete) {
    return (
      <main className="min-h-screen flex flex-col pt-4 sm:pt-6 pb-8" data-study>
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 flex flex-col flex-1 justify-center gap-4">
          <CategoryHeader
            backHref={backHref}
            categoryName={categoryName}
            currentDeckIndex={currentDeckIndex}
            totalDecks={decks.length}
            deckName={currentDeck?.name}
          />
          <div className="flex flex-1 w-full justify-center items-center">
            <Card className="max-w-md w-full mx-2 sm:mx-0">
              <CardContent className="pt-6 space-y-4">
                <p className="text-center font-medium">
                  Finished <span className="text-foreground">{currentDeck?.name}</span>
                </p>
                <p className="text-sm text-muted-foreground text-center">
                  {flashcards.length} card{flashcards.length !== 1 ? "s" : ""} reviewed
                </p>
                <div className="flex justify-center">
                  <Button className="h-11 active:opacity-80" onClick={advanceToNextDeck}>
                    {currentDeckIndex < decks.length - 1 ? "Next deck" : "Finish category"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    );
  }

  const card = flashcards[currentCardIndex];
  const isFirst = currentCardIndex === 0;
  const isLast = currentCardIndex === flashcards.length - 1;

  return (
    <main
      className="h-full min-h-0 flex flex-col items-center overflow-hidden relative"
      data-study
    >
      <Link
        href={backHref}
        className="fixed bottom-4 right-4 sm:bottom-8 sm:right-[max(0.5rem,calc(50vw-min(50vw,18rem)))] z-50 inline-flex items-center gap-1.5 rounded-full bg-background/95 backdrop-blur border border-border shadow-lg px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium hover:bg-muted active:opacity-80 transition-colors"
      >
        <X className="size-3.5 sm:size-4" />
        <span className="hidden sm:inline">Exit Category Review</span>
        <span className="sm:hidden">Exit</span>
      </Link>

      <div className="pt-4 sm:pt-6 shrink-0 w-full">
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8">
          <Link
            href={backHref}
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
          >
            ← Back
          </Link>
          <div className="mt-1.5 space-y-1">
            <p className="text-sm font-medium text-muted-foreground truncate">
              {categoryName ?? "Category review"}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Deck {currentDeckIndex + 1}/{decks.length}
              </span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs font-medium truncate">
                {currentDeck?.name}
              </span>
            </div>
            <DeckProgressBar current={currentDeckIndex} total={decks.length} />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center flex-1 min-h-0 w-full mt-2 sm:mt-0">
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
          <div className="flex justify-center items-center flex-1 min-w-0 w-full order-1 landscape:order-2 px-2 sm:px-2">
            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              dir="auto"
              className="flashcard relative w-full max-w-2xl sm:max-w-3xl aspect-[3/2] rounded-2xl shadow-lg overflow-hidden flex flex-col touch-pan-y transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-xl hover:rotate-[0.3deg] active:translate-y-0 active:shadow-md"
            >
              <div className="absolute top-4 right-4 sm:top-6 sm:right-6 text-xs sm:text-sm text-muted-foreground z-10">
                {currentCardIndex + 1} / {flashcards.length}
              </div>
              <Flashcard
                cardStyle={userSettings.card_style}
                front={
                  <div className="flex-1 min-h-0 w-full overflow-y-auto">
                    <FormattedText
                      text={card.question}
                      className="text-2xl sm:text-3xl lg:text-4xl font-medium leading-snug sm:leading-relaxed"
                    />
                  </div>
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
                    {showAnswer && (
                      <div
                        className="flex flex-row gap-2 justify-center flex-wrap shrink-0 w-full"
                        onClick={(e) => e.stopPropagation()}
                      >
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
            className="h-11 w-11 shrink-0 lg:h-12 lg:w-12"
            aria-label="Previous card"
          >
            <ChevronLeft className="size-5 lg:size-6" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleNext}
            disabled={isLast}
            className="h-11 w-11 shrink-0 lg:h-12 lg:w-12"
            aria-label="Next card"
          >
            <ChevronRight className="size-5 lg:size-6" />
          </Button>
        </div>
      </div>
    </main>
  );
}

function CategoryHeader({
  backHref,
  categoryName,
  currentDeckIndex,
  totalDecks,
  deckName,
}: {
  backHref: string;
  categoryName: string | null;
  currentDeckIndex?: number;
  totalDecks?: number;
  deckName?: string;
}) {
  const showDeckInfo =
    currentDeckIndex !== undefined && totalDecks !== undefined && totalDecks > 0;
  return (
    <div className="space-y-1.5">
      <Link
        href={backHref}
        className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted w-fit"
      >
        ← Back
      </Link>
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground truncate">
          {categoryName ?? "Category review"}
        </p>
        {showDeckInfo && (
          <>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Deck {currentDeckIndex! + 1}/{totalDecks}
              </span>
              {deckName && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs font-medium truncate">
                    {deckName}
                  </span>
                </>
              )}
            </div>
            <DeckProgressBar current={currentDeckIndex!} total={totalDecks!} />
          </>
        )}
      </div>
    </div>
  );
}

function DeckProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? ((current + 1) / total) * 100 : 0;
  return (
    <div className="h-1 rounded-full bg-muted overflow-hidden w-full max-w-xs">
      <div
        className="h-full rounded-full bg-neutral-900 dark:bg-neutral-100 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
