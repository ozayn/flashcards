"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Flashcard } from "@/components/study/Flashcard";
import FormattedText from "@/components/FormattedText";
import {
  getCategoryDecks,
  getCategories,
  getFlashcards,
  getUserSettings,
  type UserSettings,
} from "@/lib/api";
import { getStoredUserId } from "@/components/user-selector";

interface CategoryExplorePageProps {
  params: { categoryId: string };
}

interface ExploreDeck {
  id: string;
  name: string;
  card_count: number;
}

interface ExploreFlashcard {
  id: string;
  question: string;
  answer_short: string;
  answer_detailed?: string | null;
}

type ExploreView = "read" | "cards";

export default function CategoryExplorePage({ params }: CategoryExplorePageProps) {
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [decks, setDecks] = useState<ExploreDeck[]>([]);
  const [currentDeckIndex, setCurrentDeckIndex] = useState(0);
  const [flashcards, setFlashcards] = useState<ExploreFlashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [exploreView, setExploreView] = useState<ExploreView>("read");
  const [deckComplete, setDeckComplete] = useState(false);
  const [categoryComplete, setCategoryComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [noUser, setNoUser] = useState(false);
  const [totalCardsSeen, setTotalCardsSeen] = useState(0);
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
        const [deckData, categories] = await Promise.all([
          getCategoryDecks(params.categoryId, userId!),
          getCategories(userId!),
        ]);
        const deckList: ExploreDeck[] = Array.isArray(deckData) ? deckData : [];
        setDecks(deckList);

        const catList = (categories ?? []) as { id: string; name: string }[];
        const currentCat = catList.find((c) => c.id === params.categoryId);
        setCategoryName(currentCat?.name ?? null);
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
      try {
        const data = await getFlashcards(deckId, { dueOnly: false });
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

  const handleNext = useCallback(() => {
    setShowAnswer(false);
    if (currentCardIndex < flashcards.length - 1) {
      setCurrentCardIndex((i) => i + 1);
    } else {
      setTotalCardsSeen((n) => n + flashcards.length);
      setDeckComplete(true);
    }
  }, [flashcards.length, currentCardIndex]);

  const handlePrev = useCallback(() => {
    setShowAnswer(false);
    setCurrentCardIndex((i) => Math.max(i - 1, 0));
  }, []);

  const touchStartY = useRef(0);

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
    if (cardsLoading || flashcards.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (exploreView === "read") {
          handleNext();
        } else {
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
  }, [cardsLoading, flashcards.length, handleNext, handlePrev, exploreView]);

  function advanceToNextDeck() {
    const next = currentDeckIndex + 1;
    if (next >= decks.length) {
      setCategoryComplete(true);
    } else {
      setCurrentDeckIndex(next);
    }
  }

  const backHref = "/decks";
  const currentDeck = decks[currentDeckIndex] as ExploreDeck | undefined;

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
          <ExploreHeader backHref={backHref} categoryName={categoryName} />
          <p className="text-muted-foreground text-center">
            No user selected. Please choose a user first.
          </p>
          <div className="flex justify-center">
            <Link
              href="/decks"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-5 text-sm font-medium"
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
          <ExploreHeader backHref={backHref} categoryName={categoryName} />
          <p className="text-muted-foreground text-center">
            This category has no decks yet.
          </p>
          <div className="flex justify-center">
            <Link
              href="/decks"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-5 text-sm font-medium"
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
          <ExploreHeader backHref={backHref} categoryName={categoryName} />
          <div className="flex flex-1 w-full justify-center items-center mt-12">
            <div className="max-w-md w-full text-center space-y-6">
              <h2 className="text-2xl font-semibold">All cards explored</h2>
              <p className="text-muted-foreground">
                {decks.length} deck{decks.length !== 1 ? "s" : ""} browsed
                {totalCardsSeen > 0 && <>, {totalCardsSeen} cards viewed</>}.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href={`/study/category/${params.categoryId}`}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-5 text-sm font-medium"
                >
                  Review this category
                </Link>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCategoryComplete(false);
                    setCurrentDeckIndex(0);
                    setTotalCardsSeen(0);
                  }}
                >
                  Explore again
                </Button>
                <Link
                  href="/decks"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
                >
                  Back to decks
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (cardsLoading) {
    return (
      <main className="min-h-screen flex flex-col pt-4 sm:pt-6 pb-8" data-study>
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 flex flex-col flex-1 justify-center gap-4">
          <ExploreHeader
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
          <ExploreHeader
            backHref={backHref}
            categoryName={categoryName}
            currentDeckIndex={currentDeckIndex}
            totalDecks={decks.length}
            deckName={currentDeck?.name}
          />
          <p className="text-muted-foreground text-center">
            No cards in <span className="font-medium text-foreground">{currentDeck?.name}</span>.
          </p>
          <div className="flex justify-center">
            <Button className="h-11 active:opacity-80" onClick={advanceToNextDeck}>
              {currentDeckIndex < decks.length - 1 ? "Next deck" : "Finish"}
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
          <ExploreHeader
            backHref={backHref}
            categoryName={categoryName}
            currentDeckIndex={currentDeckIndex}
            totalDecks={decks.length}
            deckName={currentDeck?.name}
          />
          <div className="flex flex-1 w-full justify-center items-center">
            <div className="max-w-md w-full text-center space-y-4">
              <p className="font-medium">
                Finished {currentDeck?.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {flashcards.length} card{flashcards.length !== 1 ? "s" : ""} browsed
              </p>
              <Button onClick={advanceToNextDeck}>
                {currentDeckIndex < decks.length - 1 ? "Next deck" : "Finish"}
              </Button>
            </div>
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
        className="fixed bottom-4 right-4 sm:bottom-8 sm:right-[max(0.5rem,calc(50vw-min(50vw,18rem)))] z-50 inline-flex items-center gap-1.5 rounded-full bg-background/95 backdrop-blur border border-border shadow-lg px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium hover:bg-muted active:opacity-80 transition-colors landscape-mobile:bottom-2 landscape-mobile:right-2 landscape-mobile:px-2.5 landscape-mobile:py-1 landscape-mobile:text-xs landscape-mobile:gap-1"
      >
        <X className="size-3.5 sm:size-4 landscape-mobile:size-3" />
        <span className="hidden sm:inline landscape-mobile:hidden">Exit Explore</span>
        <span className="sm:hidden">Exit</span>
      </Link>

      <div className="pt-4 sm:pt-6 landscape-mobile:pt-2 shrink-0 w-full">
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8">
          <Link
            href={backHref}
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted landscape-mobile:h-6 landscape-mobile:text-xs landscape-mobile:px-1.5"
          >
            ← Back
          </Link>
          <div className="mt-1.5 space-y-1.5 landscape-mobile:mt-1 landscape-mobile:space-y-0.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground truncate">
                <span className="font-medium">{categoryName ?? "Category"}</span>
                {currentDeck && (
                  <> · {currentDeck.name} ({currentDeckIndex + 1}/{decks.length})</>
                )}
              </p>
              <div className="flex items-center gap-2">
                <span className="hidden landscape-mobile:inline text-xs text-muted-foreground tabular-nums">
                  {currentCardIndex + 1}/{flashcards.length}
                </span>
                <div className="flex items-center gap-0.5 rounded-lg border border-border/60 p-0.5 bg-muted/20">
                  <button
                    type="button"
                    onClick={() => setExploreView("read")}
                    className={`px-3 py-1 min-h-[32px] landscape-mobile:min-h-[28px] landscape-mobile:px-2 landscape-mobile:text-xs rounded-md text-xs sm:text-sm font-medium transition-colors ${
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
                    className={`px-3 py-1 min-h-[32px] landscape-mobile:min-h-[28px] landscape-mobile:px-2 landscape-mobile:text-xs rounded-md text-xs sm:text-sm font-medium transition-colors ${
                      exploreView === "cards"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Cards
                  </button>
                </div>
              </div>
            </div>
            <DeckProgressBar current={currentDeckIndex} total={decks.length} />
          </div>
        </div>
      </div>

      {exploreView === "read" ? (
        <div className="flex-1 min-h-0 w-full overflow-y-auto">
          <div className="max-w-2xl sm:max-w-3xl mx-auto w-full px-5 sm:px-6 md:px-8 py-6 sm:py-10 landscape-mobile:py-3">
            <article dir="auto" className="space-y-5 sm:space-y-8 landscape-mobile:space-y-3" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
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
            <div className="flex items-center justify-center gap-4 mt-8 sm:mt-10 pb-4 landscape-mobile:hidden">
              <Button variant="outline" size="icon" onClick={handlePrev} disabled={isFirst} className="hidden sm:inline-flex h-10 w-10 lg:h-12 lg:w-12" aria-label="Previous card">
                <ChevronLeft className="size-5 lg:size-6" />
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums text-center">
                {currentCardIndex + 1} / {flashcards.length}
              </span>
              <Button variant="outline" size="icon" onClick={handleNext} disabled={isLast && deckComplete} className="hidden sm:inline-flex h-10 w-10 lg:h-12 lg:w-12" aria-label="Next card">
                <ChevronRight className="size-5 lg:size-6" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
      <div className="flex flex-col items-center justify-center flex-1 min-h-0 w-full mt-2 sm:mt-0 landscape-mobile:mt-0">
        <div className="flex-1 min-h-0 min-h-[200px] landscape-mobile:min-h-0 flex flex-col landscape:flex-row landscape:items-stretch landscape:min-h-0 justify-center items-center gap-2 landscape-mobile:gap-0 w-full max-w-4xl mx-auto relative overflow-hidden [perspective:1000px]">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrev}
            disabled={isFirst}
            className="hidden landscape:flex landscape-mobile:!hidden h-10 w-10 shrink-0 order-2 landscape:order-1"
            aria-label="Previous card"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <div className="flex justify-center items-center flex-1 min-w-0 w-full order-1 landscape:order-2 px-2 sm:px-2">
            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              dir="auto"
              className="flashcard relative w-full max-w-2xl sm:max-w-3xl aspect-[3/2] landscape-mobile:aspect-auto landscape-mobile:h-[calc(100dvh-5rem)] rounded-2xl shadow-lg overflow-hidden flex flex-col touch-pan-y transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-xl hover:rotate-[0.3deg] active:translate-y-0 active:shadow-md"
            >
              <div className="absolute top-4 right-4 sm:top-6 sm:right-6 text-xs sm:text-sm text-muted-foreground z-10 landscape-mobile:top-2 landscape-mobile:right-3">
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
                  <div className="flex-1 min-h-0 flex flex-col items-stretch justify-start w-full overflow-y-auto cursor-pointer">
                    <FormattedText
                      text={card.answer_short}
                      className="whitespace-pre-line text-xl sm:text-2xl lg:text-[1.75rem] leading-relaxed mt-6 sm:mt-8 landscape-mobile:mt-2"
                    />
                    {card.answer_detailed &&
                      card.answer_detailed.trim() !== card.answer_short.trim() && (
                        <FormattedText
                          text={card.answer_detailed}
                          className="whitespace-pre-line text-base sm:text-lg lg:text-xl text-muted-foreground mt-4 sm:mt-5 landscape-mobile:mt-2"
                        />
                      )}
                  </div>
                }
                flipped={showAnswer}
                onFlip={() => setShowAnswer((prev) => !prev)}
                canFlip={true}
              />
            </div>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={handleNext}
            disabled={isLast && deckComplete}
            className="hidden landscape:flex landscape-mobile:!hidden h-10 w-10 shrink-0 order-3"
            aria-label="Next card"
          >
            <ChevronRight className="size-5" />
          </Button>
        </div>

        <div className="shrink-0 flex justify-center gap-4 mt-2 pb-2 landscape:hidden landscape-mobile:!hidden">
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
            disabled={isLast && deckComplete}
            className="h-11 w-11 shrink-0 lg:h-12 lg:w-12"
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

function ExploreHeader({
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
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-muted-foreground truncate">
            {categoryName ?? "Category"}
          </p>
          <span className="text-xs text-muted-foreground/60 font-medium">Explore</span>
        </div>
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
