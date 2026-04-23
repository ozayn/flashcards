"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Flashcard } from "@/components/study/Flashcard";
import FormattedText from "@/components/FormattedText";
import {
  buildAnswerDisplayText,
  buildAnswerSpeechText,
  shouldShowAnswerDetailed,
} from "@/lib/format-flashcard-answer-display";
import { cancelAllFlashcardSpeech } from "@/lib/flashcard-speech";
import {
  getCategoryDecks,
  getCategories,
  getFlashcards,
  getUserSettings,
  setFlashcardBookmark,
  type UserSettings,
} from "@/lib/api";
import { FlashcardBookmarkStar } from "@/components/flashcard-bookmark-star";
import { getStoredUserId } from "@/components/user-selector";
import { FlashcardSpeakButton } from "@/components/flashcard-speak-button";
import { ReadTabSpeakButton } from "@/components/read-tab-speak-button";
import { cn } from "@/lib/utils";

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
  answer_example?: string | null;
  answer_detailed?: string | null;
  bookmarked?: boolean;
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
    english_tts: "default",
    voice_style: "default",
  });
  const touchStartX = useRef(0);
  const [bookmarkBusyId, setBookmarkBusyId] = useState<string | null>(null);

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
  }, [handlePrev, handleNext, exploreView]);

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

  useEffect(() => {
    return () => {
      cancelAllFlashcardSpeech();
    };
  }, []);

  useEffect(() => {
    cancelAllFlashcardSpeech();
  }, [currentCardIndex, currentDeckIndex, params.categoryId, exploreView]);

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
                  Quiz this category
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
      <header className="shrink-0 border-b border-border/40 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-3 py-2 sm:px-6 sm:py-2.5 md:px-8 landscape-mobile:py-1.5 landscape-mobile:pl-2 landscape-mobile:pr-2">
          <div className="flex items-start gap-2 sm:items-center sm:gap-3">
            <Link
              href={backHref}
              className="shrink-0 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:px-2 sm:text-sm"
            >
              ← Back
            </Link>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="truncate text-xs text-muted-foreground sm:text-sm">
                <span className="font-medium text-foreground">{categoryName ?? "Category"}</span>
                {currentDeck && (
                  <>
                    {" "}
                    · {currentDeck.name}{" "}
                    <span className="tabular-nums">
                      ({currentDeckIndex + 1}/{decks.length})
                    </span>
                  </>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="inline-flex gap-0.5 rounded-lg border border-border/50 bg-muted/20 p-0.5"
                  role="tablist"
                  aria-label="Explore mode"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={exploreView === "read"}
                    onClick={() => setExploreView("read")}
                    className={`rounded-md px-3 py-1.5 text-center text-[11px] font-medium transition-colors sm:min-h-8 sm:text-xs ${
                      exploreView === "read"
                        ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Read
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={exploreView === "cards"}
                    onClick={() => setExploreView("cards")}
                    className={`rounded-md px-3 py-1.5 text-center text-[11px] font-medium transition-colors sm:min-h-8 sm:text-xs ${
                      exploreView === "cards"
                        ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Cards
                  </button>
                </div>
                <DeckProgressBar current={currentDeckIndex} total={decks.length} />
              </div>
            </div>
          </div>
        </div>
      </header>

      {exploreView === "read" ? (
        <div ref={readScrollRef} className="min-h-0 w-full flex-1 touch-pan-y overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:max-w-3xl sm:px-6 sm:py-7 md:px-8 landscape-mobile:px-3 landscape-mobile:py-3">
            <article
              dir="auto"
              className={cn(
                "relative space-y-4 sm:space-y-6 landscape-mobile:space-y-3",
                getStoredUserId() &&
                  "pt-1 pe-11 sm:pe-12 landscape-mobile:pt-0.5 landscape-mobile:pe-10"
              )}
            >
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
              <div className="mb-0 flex min-h-0 items-center">
                <ReadTabSpeakButton
                  utteranceKey={`explore-cat-${params.categoryId}-read-full-${card.id}`}
                  question={card.question}
                  answer={buildAnswerSpeechText(
                    card.answer_short,
                    card.answer_example,
                    card.answer_detailed
                  )}
                  englishTts={userSettings.english_tts}
                  voiceStyle={userSettings.voice_style}
                />
              </div>
              <FormattedText
                text={card.question}
                className="text-2xl sm:text-3xl lg:text-4xl font-medium leading-snug sm:leading-relaxed"
              />
              <hr className="border-border" />
              <FormattedText
                text={buildAnswerDisplayText(
                  card.answer_short,
                  card.answer_example
                )}
                className="whitespace-pre-line text-lg sm:text-2xl lg:text-[1.75rem] leading-relaxed"
                variant="answer"
              />
              {shouldShowAnswerDetailed(
                card.answer_detailed,
                card.answer_short,
                card.answer_example
              ) ? (
                <div className="border-l-2 border-border pl-4 sm:pl-5">
                  <FormattedText
                    text={card.answer_detailed ?? ""}
                    className="whitespace-pre-line text-base sm:text-lg lg:text-xl text-muted-foreground leading-relaxed"
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
                disabled={isLast && deckComplete}
                className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
                aria-label="Next card"
              >
                <ChevronRight className="size-5" />
              </Button>
            </nav>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col landscape-mobile:overflow-hidden">
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
                      utteranceKey={`explore-cat-${params.categoryId}-flip-${card.id}-${showAnswer ? "a" : "q"}`}
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
                        className="text-2xl font-medium leading-snug sm:text-3xl sm:leading-relaxed lg:text-4xl"
                      />
                    </div>
                  }
                  back={
                    <div className="flex min-h-0 w-full flex-1 cursor-pointer flex-col items-stretch justify-start overflow-y-auto">
                      <FormattedText
                        text={buildAnswerDisplayText(
                          card.answer_short,
                          card.answer_example
                        )}
                        className="mt-5 whitespace-pre-line text-xl leading-relaxed sm:mt-7 sm:text-2xl lg:text-[1.75rem] landscape-mobile:mt-2 landscape-mobile:text-xl"
                        variant="answer"
                      />
                      {shouldShowAnswerDetailed(
                        card.answer_detailed,
                        card.answer_short,
                        card.answer_example
                      ) ? (
                        <FormattedText
                          text={card.answer_detailed ?? ""}
                          className="mt-3 whitespace-pre-line text-base leading-relaxed text-muted-foreground sm:mt-4 sm:text-lg lg:text-xl landscape-mobile:mt-2"
                          variant="answer"
                        />
                      ) : null}
                    </div>
                  }
                  flipped={showAnswer}
                  onFlip={() => setShowAnswer((prev) => !prev)}
                  canFlip={true}
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
                disabled={isLast && deckComplete}
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
