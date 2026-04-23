"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { X, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlashcardBookmarkStar } from "@/components/flashcard-bookmark-star";
import { FlashcardFlip } from "@/components/FlashcardFlip";
import FormattedText from "@/components/FormattedText";
import {
  buildAnswerDisplayText,
  buildAnswerSpeechText,
  shouldShowAnswerDetailed,
} from "@/lib/format-flashcard-answer-display";
import { cancelAllFlashcardSpeech, type EnglishTtsPreference, type VoiceStylePreference } from "@/lib/flashcard-speech";
import { FlashcardSpeakButton } from "@/components/flashcard-speak-button";
import { inferTextDirection } from "@/lib/infer-text-direction";
import { cn } from "@/lib/utils";
import { FlashcardCardImage } from "@/components/flashcard-card-image";

export interface FlashcardModalCard {
  id: string;
  question: string;
  answer_short: string;
  answer_example?: string | null;
  answer_detailed?: string | null;
  image_url?: string | null;
  bookmarked?: boolean;
}

export interface FlashcardModalProps {
  cards: FlashcardModalCard[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  /** Optional: base path for edit link, e.g. /decks/abc/edit-card */
  editBasePath?: string;
  /** Optional: sort/search query for edit flow, e.g. `?sort=newest&q=…` */
  editQuerySuffix?: string;
  /** When set, show save control and call with the desired bookmark state */
  onBookmarkToggle?: (cardId: string, bookmarked: boolean) => void;
  bookmarkPendingId?: string | null;
  /** English read-aloud accent; other languages are unchanged. */
  englishTts?: EnglishTtsPreference;
  /** Best-effort read-aloud voice style (name heuristics). */
  voiceStyle?: VoiceStylePreference;
  /** Optional specific Web Speech voice; overrides heuristics when available. */
  speechVoiceKey?: string;
}

type ViewMode = "details" | "flashcard";

export function FlashcardModal({
  cards,
  initialIndex,
  isOpen,
  onClose,
  editBasePath,
  editQuerySuffix = "",
  onBookmarkToggle,
  bookmarkPendingId,
  englishTts = "default",
  voiceStyle = "default",
  speechVoiceKey,
}: FlashcardModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [viewMode, setViewMode] = useState<ViewMode>("details");
  const [flipState, setFlipState] = useState(false);

  const card = cards[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < cards.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) setCurrentIndex((i) => i - 1);
  }, [hasPrev]);

  const goNext = useCallback(() => {
    if (hasNext) setCurrentIndex((i) => i + 1);
  }, [hasNext]);

  // Sync index when modal opens with a different initial
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.min(Math.max(0, initialIndex), cards.length - 1));
    }
  }, [isOpen, initialIndex, cards.length]);

  // Reset flip when card or view mode changes
  useEffect(() => {
    setFlipState(false);
  }, [currentIndex, viewMode]);

  useEffect(() => {
    return () => {
      cancelAllFlashcardSpeech();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      cancelAllFlashcardSpeech();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    cancelAllFlashcardSpeech();
  }, [isOpen, currentIndex, viewMode, flipState, card?.id]);

  // Keyboard handlers (only when modal is open)
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (currentIndex > 0) goPrev();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (currentIndex < cards.length - 1) goNext();
        return;
      }
      if (e.key === " " && viewMode === "flashcard") {
        e.preventDefault();
        setFlipState((f) => !f);
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, goPrev, goNext, viewMode, currentIndex, cards.length]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen || !card) return null;

  const cardTextDir = inferTextDirection(
    card.question,
    buildAnswerDisplayText(card.answer_short, card.answer_example),
    card.answer_detailed ?? ""
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Flashcard detail"
    >
      <div
        className="bg-background rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 px-4 py-3 border-b border-border gap-3">
          <span className="text-sm text-muted-foreground tabular-nums shrink-0">
            {currentIndex + 1} / {cards.length}
          </span>

          <div className="flex items-center gap-1 min-w-0 justify-end">
            <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
              <button
                type="button"
                onClick={() => setViewMode("details")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  viewMode === "details"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => setViewMode("flashcard")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  viewMode === "flashcard"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Flashcard
              </button>
            </div>

            {editBasePath && card && (
              <Link
                href={`${editBasePath}/${card.id}${editQuerySuffix}`}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Pencil className="size-4" />
                Edit
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground ms-1"
            >
              <X className="size-5" />
            </Button>
          </div>
        </div>

        {/* Body: details = scroll + edge nav; flashcard = arrows aligned to card midline */}
        {viewMode === "details" ? (
          <div className="relative flex flex-1 min-h-0">
            <div className="flex flex-1 min-h-0 w-full min-w-0">
              <div className="hidden sm:flex w-11 md:w-12 shrink-0 items-center justify-center pl-1 md:pl-2">
                {hasPrev ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={goPrev}
                    aria-label="Previous card"
                    className="size-10 md:size-11 text-muted-foreground hover:text-foreground hover:bg-muted/80 shrink-0 rounded-full"
                  >
                    <ChevronLeft className="size-5 md:size-6" />
                  </Button>
                ) : null}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto min-w-0 px-11 py-4 sm:px-4 sm:py-4">
                <div
                  className={cn(
                    "relative space-y-4 max-w-2xl mx-auto w-full",
                    onBookmarkToggle && "pt-1 pe-11 sm:pe-12"
                  )}
                  dir={cardTextDir}
                >
                  {onBookmarkToggle ? (
                    <div className="absolute end-1 top-0.5 z-10 sm:end-1.5 sm:top-1">
                      <FlashcardBookmarkStar
                        bookmarked={Boolean(card.bookmarked)}
                        busy={bookmarkPendingId === card.id}
                        onToggle={() =>
                          onBookmarkToggle(card.id, !card.bookmarked)
                        }
                      />
                    </div>
                  ) : null}
                  <div>
                    <div className="mb-1.5 flex items-center gap-0.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Question
                      </p>
                      <FlashcardSpeakButton
                        utteranceKey={`fc-modal-${card.id}-d-q`}
                        text={card.question}
                        aria-label="Speak question"
                        englishTts={englishTts}
                        voiceStyle={voiceStyle}
                        speechVoiceKey={speechVoiceKey}
                      />
                    </div>
                    <div dir="auto" className="text-base font-medium leading-relaxed text-foreground">
                      <FormattedText text={card.question} className="text-inherit" />
                    </div>
                    {card.image_url ? (
                      <div className="pt-3">
                        <FlashcardCardImage imageUrl={card.image_url} size="md" />
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center gap-0.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Answer
                      </p>
                      <FlashcardSpeakButton
                        utteranceKey={`fc-modal-${card.id}-d-a`}
                        text={buildAnswerSpeechText(
                          card.answer_short,
                          card.answer_example,
                          card.answer_detailed
                        )}
                        aria-label="Speak answer"
                        englishTts={englishTts}
                        voiceStyle={voiceStyle}
                        speechVoiceKey={speechVoiceKey}
                      />
                    </div>
                    <div dir="auto" className="text-base leading-relaxed text-foreground">
                      <FormattedText
                        text={buildAnswerDisplayText(
                          card.answer_short,
                          card.answer_example
                        )}
                        className="text-inherit"
                        variant="answer"
                      />
                    </div>
                  </div>
                  {shouldShowAnswerDetailed(
                    card.answer_detailed,
                    card.answer_short,
                    card.answer_example
                  ) ? (
                    <div>
                      <div className="mb-1.5 flex items-center gap-0.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Notes
                        </p>
                        <FlashcardSpeakButton
                          utteranceKey={`fc-modal-${card.id}-d-n`}
                          text={card.answer_detailed ?? ""}
                          aria-label="Speak notes"
                          englishTts={englishTts}
                          voiceStyle={voiceStyle}
                          speechVoiceKey={speechVoiceKey}
                        />
                      </div>
                      <div dir="auto" className="text-base leading-relaxed text-muted-foreground">
                        <FormattedText
                          text={card.answer_detailed ?? ""}
                          className="text-inherit"
                          variant="answer"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="hidden sm:flex w-11 md:w-12 shrink-0 items-center justify-center pr-1 md:pr-2">
                {hasNext ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={goNext}
                    aria-label="Next card"
                    className="size-10 md:size-11 text-muted-foreground hover:text-foreground hover:bg-muted/80 shrink-0 rounded-full"
                  >
                    <ChevronRight className="size-5 md:size-6" />
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="sm:hidden pointer-events-none absolute inset-0 flex items-center justify-between px-0.5 z-20">
              <div className="pointer-events-auto flex w-11 justify-start">
                {hasPrev ? (
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={goPrev}
                    aria-label="Previous card"
                    className="size-10 rounded-full border border-border/60 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-background"
                  >
                    <ChevronLeft className="size-5" />
                  </Button>
                ) : null}
              </div>
              <div className="pointer-events-auto flex w-11 justify-end">
                {hasNext ? (
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={goNext}
                    aria-label="Next card"
                    className="size-10 rounded-full border border-border/60 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-background"
                  >
                    <ChevronRight className="size-5" />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 flex-col min-w-0 p-4 sm:p-5">
            <div className="flex flex-1 min-h-0 w-full max-w-5xl mx-auto items-center justify-center">
              <div className="flex w-full items-center justify-center gap-2 sm:gap-3 md:gap-4 min-h-0 min-w-0">
                <div className="hidden sm:flex w-11 md:w-12 shrink-0 items-center justify-center">
                  {hasPrev ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={goPrev}
                      aria-label="Previous card"
                      className="size-10 md:size-11 text-muted-foreground hover:text-foreground hover:bg-muted/80 shrink-0 rounded-full"
                    >
                      <ChevronLeft className="size-5 md:size-6" />
                    </Button>
                  ) : (
                    <span className="inline-block w-10 md:w-11 shrink-0" aria-hidden />
                  )}
                </div>
                <div
                  className="relative w-full min-w-0 max-w-2xl sm:max-w-3xl flex justify-center"
                  dir={cardTextDir}
                >
                  {onBookmarkToggle ? (
                    <div className="pointer-events-auto absolute end-2 top-2 z-30 sm:end-3 sm:top-3">
                      <FlashcardBookmarkStar
                        bookmarked={Boolean(card.bookmarked)}
                        busy={bookmarkPendingId === card.id}
                        onToggle={() =>
                          onBookmarkToggle(card.id, !card.bookmarked)
                        }
                        compact
                        className="bg-background/80 backdrop-blur-sm"
                      />
                    </div>
                  ) : null}
                  <div className="pointer-events-auto absolute start-2 top-2 z-25 sm:start-3 sm:top-3">
                    <div className="flex rounded-md bg-background/80 backdrop-blur-sm">
                      <FlashcardSpeakButton
                        className="h-8 w-8"
                        utteranceKey={`fc-modal-${card.id}-f-${flipState ? "a" : "q"}`}
                        text={
                          flipState
                            ? buildAnswerSpeechText(
                                card.answer_short,
                                card.answer_example,
                                card.answer_detailed
                              )
                            : card.question
                        }
                        aria-label={flipState ? "Speak answer" : "Speak question"}
                        englishTts={englishTts}
                        voiceStyle={voiceStyle}
                        speechVoiceKey={speechVoiceKey}
                      />
                    </div>
                  </div>
                  <FlashcardFlip
                    key={card.id}
                    reserveBookmarkCorner={Boolean(onBookmarkToggle)}
                    question={
                      <div className="flex w-full min-w-0 flex-col items-stretch gap-3">
                        {card.image_url ? (
                          <FlashcardCardImage
                            imageUrl={card.image_url}
                            size="lg"
                            className="shrink-0"
                          />
                        ) : null}
                        <div className="text-2xl sm:text-3xl lg:text-4xl font-medium leading-snug sm:leading-relaxed text-foreground min-w-0">
                          <FormattedText text={card.question} className="text-inherit" />
                        </div>
                      </div>
                    }
                    answer={
                      <FormattedText
                        text={buildAnswerDisplayText(
                          card.answer_short,
                          card.answer_example
                        )}
                        className="whitespace-pre-line text-xl sm:text-2xl lg:text-[1.75rem] leading-relaxed text-foreground"
                        variant="answer"
                      />
                    }
                    className="w-full"
                    flipped={flipState}
                    onFlip={() => setFlipState((f) => !f)}
                  />
                  <div className="sm:hidden absolute inset-0 flex items-center justify-between pointer-events-none z-20 px-0">
                    <div className="pointer-events-auto flex w-11 justify-start pl-0.5">
                      {hasPrev ? (
                        <Button
                          variant="secondary"
                          size="icon"
                          onClick={goPrev}
                          aria-label="Previous card"
                          className="size-10 rounded-full border border-border/60 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-background"
                        >
                          <ChevronLeft className="size-5" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="pointer-events-auto flex w-11 justify-end pr-0.5">
                      {hasNext ? (
                        <Button
                          variant="secondary"
                          size="icon"
                          onClick={goNext}
                          aria-label="Next card"
                          className="size-10 rounded-full border border-border/60 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-background"
                        >
                          <ChevronRight className="size-5" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex w-11 md:w-12 shrink-0 items-center justify-center">
                  {hasNext ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={goNext}
                      aria-label="Next card"
                      className="size-10 md:size-11 text-muted-foreground hover:text-foreground hover:bg-muted/80 shrink-0 rounded-full"
                    >
                      <ChevronRight className="size-5 md:size-6" />
                    </Button>
                  ) : (
                    <span className="inline-block w-10 md:w-11 shrink-0" aria-hidden />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
