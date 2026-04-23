"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  deleteFlashcard,
  getFlashcard,
  getFlashcards,
  setFlashcardBookmark,
  updateFlashcard,
} from "@/lib/api";
import {
  getNextEditCardId,
  getPrevEditCardId,
  parseDeckEditCardQuery,
} from "@/lib/deck-flashcards-display-order";
import { FlashcardBookmarkStar } from "@/components/flashcard-bookmark-star";
import { cn } from "@/lib/utils";
import PageContainer from "@/components/layout/page-container";
import { FlashcardMarkdownToolbar } from "@/components/flashcard-markdown-toolbar";
import { getStoredUserId } from "@/components/user-selector";

interface EditCardPageProps {
  params: { id: string; card_id: string };
}

type DeckCardRow = {
  id: string;
  question: string;
  answer_short: string;
  answer_example?: string | null;
  answer_detailed?: string | null;
  bookmarked?: boolean;
};

export default function EditCardPage({ params }: EditCardPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);

  const [question, setQuestion] = useState("");
  const [answerShort, setAnswerShort] = useState("");
  const [answerExample, setAnswerExample] = useState("");
  const [answerDetailed, setAnswerDetailed] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);
  const [listHint, setListHint] = useState<string | null>(null);
  const [deckCards, setDeckCards] = useState<DeckCardRow[]>([]);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkPending, setBookmarkPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const questionRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const answerExampleRef = useRef<HTMLTextAreaElement>(null);
  const answerDetailedRef = useRef<HTMLTextAreaElement>(null);

  const cardTextareaClass = cn(
    "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base text-start transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm resize-y"
  );

  const queryOpts = useMemo(
    () => parseDeckEditCardQuery(searchParams),
    [searchParams]
  );

  const querySuffix = useMemo(() => {
    const s = searchParams.toString();
    return s ? `?${s}` : "";
  }, [searchParams]);

  const actingUserId = getStoredUserId();

  const nextCardId = useMemo(
    () =>
      getNextEditCardId(
        deckCards,
        params.card_id,
        queryOpts,
        actingUserId
      ),
    [deckCards, params.card_id, queryOpts, actingUserId]
  );

  const prevCardId = useMemo(
    () =>
      getPrevEditCardId(
        deckCards,
        params.card_id,
        queryOpts,
        actingUserId
      ),
    [deckCards, params.card_id, queryOpts, actingUserId]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [data, list] = await Promise.all([
          getFlashcard(params.card_id),
          getFlashcards(params.id),
        ]);
        if (cancelled) return;
        setDeckCards(Array.isArray(list) ? (list as DeckCardRow[]) : []);
        setQuestion(data.question);
        setAnswerShort(data.answer_short);
        setAnswerExample(data.answer_example ?? "");
        setAnswerDetailed(data.answer_detailed ?? "");
        setDifficulty((data.difficulty as "easy" | "medium" | "hard") ?? "medium");
        setBookmarked(Boolean((data as { bookmarked?: boolean }).bookmarked));
      } catch {
        if (!cancelled) setError("Failed to load card");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.card_id, params.id]);

  const persistCard = async () => {
    await updateFlashcard(params.card_id, {
      question,
      answer_short: answerShort,
      answer_example: answerExample.trim() === "" ? null : answerExample.trim(),
      answer_detailed: answerDetailed.trim() || undefined,
      difficulty,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    setListHint(null);
    try {
      await persistCard();
      setSavedHint(true);
      window.setTimeout(() => setSavedHint(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const goToEditCard = (cardId: string) => {
    router.replace(
      `/decks/${params.id}/edit-card/${cardId}${querySuffix}`
    );
  };

  const handleSaveAndNext = async () => {
    if (!formRef.current?.checkValidity()) {
      formRef.current?.reportValidity();
      return;
    }
    setError(null);
    setListHint(null);
    setSubmitting(true);
    try {
      await persistCard();
      if (!nextCardId) {
        setListHint("No next card in this list.");
        window.setTimeout(() => setListHint(null), 4000);
        return;
      }
      goToEditCard(nextCardId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBookmarkToggle = async () => {
    if (!actingUserId || bookmarkPending || deleting) return;
    const next = !bookmarked;
    setBookmarkPending(true);
    setError(null);
    try {
      await setFlashcardBookmark(params.card_id, next);
      setBookmarked(next);
      setDeckCards((prev) =>
        prev.map((c) => (c.id === params.card_id ? { ...c, bookmarked: next } : c))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update saved state");
    } finally {
      setBookmarkPending(false);
    }
  };

  const handleDeleteCard = async () => {
    if (deleting) return;
    setError(null);
    setDeleting(true);
    const targetNextId = nextCardId;
    const targetPrevId = prevCardId;
    try {
      await deleteFlashcard(params.card_id);
      setDeleteConfirmOpen(false);
      if (targetNextId) {
        router.replace(`/decks/${params.id}/edit-card/${targetNextId}${querySuffix}`);
      } else if (targetPrevId) {
        router.replace(`/decks/${params.id}/edit-card/${targetPrevId}${querySuffix}`);
      } else {
        router.replace(`/decks/${params.id}`);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete card. Try again."
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveAndPrev = async () => {
    if (!formRef.current?.checkValidity()) {
      formRef.current?.reportValidity();
      return;
    }
    setError(null);
    setListHint(null);
    setSubmitting(true);
    try {
      await persistCard();
      if (!prevCardId) {
        setListHint("No previous card in this list.");
        window.setTimeout(() => setListHint(null), 4000);
        return;
      }
      goToEditCard(prevCardId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Loading...</p>
      </PageContainer>
    );
  }

  if (error && !question) {
    return (
      <PageContainer>
        <div className="flex items-center gap-4">
          <Link
            href={`/decks/${params.id}`}
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
          >
            ← Back
          </Link>
        </div>
        <p className="text-destructive">{error}</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={`/decks/${params.id}`}
          className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
        >
          ← Back to deck
        </Link>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-4">
          <CardTitle>Edit Card</CardTitle>
          {actingUserId ? (
            <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
              <span className="text-xs text-muted-foreground sm:text-sm">
                Saved for later
              </span>
              <FlashcardBookmarkStar
                bookmarked={bookmarked}
                onToggle={() => void handleBookmarkToggle()}
                busy={bookmarkPending}
                disabled={deleting}
              />
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="question" className="text-sm font-medium">
                  Question
                </label>
                <FlashcardMarkdownToolbar
                  inputRef={questionRef}
                  value={question}
                  onChange={setQuestion}
                />
              </div>
              <textarea
                ref={questionRef}
                id="question"
                dir="auto"
                required
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What is the capital of France?"
                rows={3}
                className={cardTextareaClass}
              />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="answer" className="text-sm font-medium">
                  Answer{" "}
                  <span className="font-normal text-muted-foreground">
                    (main definition)
                  </span>
                </label>
                <FlashcardMarkdownToolbar
                  inputRef={answerRef}
                  value={answerShort}
                  onChange={setAnswerShort}
                />
              </div>
              <textarea
                ref={answerRef}
                id="answer"
                dir="auto"
                required
                value={answerShort}
                onChange={(e) => setAnswerShort(e.target.value)}
                placeholder="Core answer or definition only — put examples in the field below."
                rows={5}
                className={cardTextareaClass}
              />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="answerExample" className="text-sm font-medium">
                  Example{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <FlashcardMarkdownToolbar
                  inputRef={answerExampleRef}
                  value={answerExample}
                  onChange={setAnswerExample}
                />
              </div>
              <textarea
                ref={answerExampleRef}
                id="answerExample"
                dir="auto"
                value={answerExample}
                onChange={(e) => setAnswerExample(e.target.value)}
                placeholder="Sample sentences, typical usage, or concrete examples."
                rows={5}
                className={cardTextareaClass}
              />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="answerDetailed" className="text-sm font-medium">
                  Detailed explanation / notes{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <FlashcardMarkdownToolbar
                  inputRef={answerDetailedRef}
                  value={answerDetailed}
                  onChange={setAnswerDetailed}
                />
              </div>
              <textarea
                ref={answerDetailedRef}
                id="answerDetailed"
                dir="auto"
                value={answerDetailed}
                onChange={(e) => setAnswerDetailed(e.target.value)}
                placeholder="Extra context, mnemonics, or longer notes."
                rows={6}
                className={cardTextareaClass}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="difficulty" className="text-sm font-medium">
                Difficulty
              </label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={(e) =>
                  setDifficulty(e.target.value as "easy" | "medium" | "hard")
                }
                className={cn(
                  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                )}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {savedHint && (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Saved.
              </p>
            )}
            {listHint && (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {listHint}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                type="submit"
                disabled={submitting || deleting}
                className="w-full sm:w-auto"
              >
                {submitting ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={submitting || deleting || !nextCardId}
                className="w-full sm:w-auto"
                onClick={() => void handleSaveAndNext()}
              >
                Save &amp; Next
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={submitting || deleting || !prevCardId}
                className="w-full sm:w-auto"
                onClick={() => void handleSaveAndPrev()}
              >
                Save &amp; Previous
              </Button>
            </div>
            <div className="mt-6 border-t border-border/80 pt-5">
              {!deleteConfirmOpen ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 w-full justify-center px-3 text-sm font-normal text-destructive/90 hover:bg-destructive/10 hover:text-destructive sm:w-auto"
                  disabled={deleting}
                  onClick={() => {
                    setDeleteConfirmOpen(true);
                    setError(null);
                  }}
                >
                  Delete card
                </Button>
              ) : (
                <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 space-y-3">
                  <p className="text-sm text-foreground">
                    Delete this card permanently? This cannot be undone.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full sm:w-auto"
                      disabled={deleting}
                      onClick={() => void handleDeleteCard()}
                    >
                      {deleting ? "Deleting…" : "Delete permanently"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      disabled={deleting}
                      onClick={() => {
                        if (!deleting) setDeleteConfirmOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
