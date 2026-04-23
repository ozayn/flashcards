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
  getDecks,
  getFlashcards,
  getUserSettings,
  submitReview,
  type UserSettings,
} from "@/lib/api";
import { getStoredUserId } from "@/components/user-selector";
import { FlashcardSpeakButton } from "@/components/flashcard-speak-button";

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
  answer_example?: string | null;
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
    english_tts: "default",
    voice_style: "default",
    speech_voice: "",
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

  useEffect(() => {
    return () => {
      cancelAllFlashcardSpeech();
    };
  }, []);

  useEffect(() => {
    cancelAllFlashcardSpeech();
  }, [currentCardIndex, currentDeckIndex, params.categoryId]);

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
          <div className="flex flex-1 w-full justify-center items-center mt-12">
            <div className="max-w-md w-full text-center space-y-6">
              <h2 className="text-2xl font-semibold">Category complete</h2>
              <p className="text-muted-foreground">
                {decks.length} deck{decks.length !== 1 ? "s" : ""} reviewed
                {totalCardsStudied > 0 && <>, {totalCardsStudied} cards total</>}.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {nextCategory && (
                  <Link
                    href={`/study/category/${nextCategory.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-5 text-sm font-medium"
                  >
                    Next: {nextCategory.name}
                  </Link>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setCategoryComplete(false);
                    setCurrentDeckIndex(0);
                    setTotalCardsStudied(0);
                  }}
                >
                  Quiz again
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
            <div className="max-w-md w-full text-center space-y-4">
              <p className="font-medium">
                Finished {currentDeck?.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {flashcards.length} card{flashcards.length !== 1 ? "s" : ""} reviewed
              </p>
              <Button onClick={advanceToNextDeck}>
                {currentDeckIndex < decks.length - 1 ? "Next deck" : "Finish category"}
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
          <Link
            href={backHref}
            className="inline-flex rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:px-2 sm:text-sm"
          >
            ← Back
          </Link>
          <div className="mt-1.5 space-y-1 landscape-mobile:mt-1">
            <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">
              {categoryName ?? "Category review"}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="whitespace-nowrap tabular-nums">
                Deck {currentDeckIndex + 1}/{decks.length}
              </span>
              <span>·</span>
              <span className="truncate font-medium text-foreground">{currentDeck?.name}</span>
            </div>
            <DeckProgressBar current={currentDeckIndex} total={decks.length} />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col landscape-mobile:overflow-hidden">
        <div className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col px-3 pt-1 sm:px-6 sm:pt-2 md:px-8 landscape-mobile:px-2 landscape-mobile:pt-0">
          <div className="flex min-h-[11rem] flex-1 flex-col justify-center landscape-mobile:min-h-0">
            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              dir="auto"
              className="flashcard relative mx-auto flex w-full max-w-2xl touch-pan-y flex-col overflow-hidden rounded-2xl shadow-md sm:max-w-3xl aspect-[3/2] landscape-mobile:aspect-auto landscape-mobile:max-h-[min(28rem,calc(100dvh-6.75rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)))] landscape-mobile:min-h-[11rem] landscape-mobile:w-full transition-shadow duration-200 hover:shadow-lg"
            >
              <div className="pointer-events-auto absolute start-2 top-2 z-20 sm:start-3 sm:top-3">
                <div className="flex rounded-md bg-background/80 backdrop-blur-sm">
                  <FlashcardSpeakButton
                    className="h-8 w-8"
                    utteranceKey={`cat-study-${params.categoryId}-${card.id}-${showAnswer ? "a" : "q"}`}
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
                front={
                  <div className="min-h-0 w-full flex-1 overflow-y-auto">
                    <FormattedText
                      text={card.question}
                      className="text-2xl font-medium leading-snug sm:text-3xl sm:leading-relaxed lg:text-4xl"
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
                    {showAnswer && (
                      <div
                        className="flex w-full shrink-0 flex-row flex-wrap justify-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          onClick={() => rateCard("again")}
                          className="shrink-0 !border-0 !bg-mondrian-red !text-white hover:!bg-mondrian-red/90"
                        >
                          Again
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => rateCard("hard")}
                          className="shrink-0 !border-0 !bg-mondrian-yellow !text-mondrian-black hover:!bg-mondrian-yellow/90"
                        >
                          Hard
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => rateCard("good")}
                          className="shrink-0 !border-0 !bg-mondrian-blue !text-white hover:!bg-mondrian-blue/90"
                        >
                          Good
                        </Button>
                        <Button variant="outline" onClick={() => rateCard("easy")} className="shrink-0">
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
