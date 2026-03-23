"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { X, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlashcardFlip } from "@/components/FlashcardFlip";
import FormattedText from "@/components/FormattedText";
import { cn } from "@/lib/utils";

export interface FlashcardModalCard {
  id: string;
  question: string;
  answer_short: string;
}

export interface FlashcardModalProps {
  cards: FlashcardModalCard[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  /** Optional: base path for edit link, e.g. /decks/abc/edit-card */
  editBasePath?: string;
}

type ViewMode = "details" | "flashcard";

export function FlashcardModal({
  cards,
  initialIndex,
  isOpen,
  onClose,
  editBasePath,
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
        goPrev();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
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
  }, [isOpen, onClose, goPrev, goNext, viewMode]);

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
        <div className="flex items-center justify-between shrink-0 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={goPrev}
              disabled={!hasPrev}
              aria-label="Previous card"
              className="text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <ChevronLeft className="size-5" />
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {currentIndex + 1} / {cards.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={goNext}
              disabled={!hasNext}
              aria-label="Next card"
              className="text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <ChevronRight className="size-5" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
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
                href={`${editBasePath}/${card.id}`}
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
              className="text-muted-foreground hover:text-foreground ml-1"
            >
              <X className="size-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {viewMode === "details" ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                  Question
                </p>
                <p dir="auto" className="text-base font-medium leading-relaxed text-foreground">
                  {card.question}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                  Answer
                </p>
                <div dir="auto" className="text-base leading-relaxed text-foreground">
                  <FormattedText text={card.answer_short} className="text-inherit" />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center min-h-[280px] py-4">
              <FlashcardFlip
                key={card.id}
                question={
                  <span className="text-2xl font-medium leading-relaxed text-foreground">
                    {card.question}
                  </span>
                }
                answer={
                  <FormattedText
                    text={card.answer_short}
                    className="whitespace-pre-line text-xl leading-relaxed text-foreground"
                  />
                }
                className="w-full"
                flipped={flipState}
                onFlip={() => setFlipState((f) => !f)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
