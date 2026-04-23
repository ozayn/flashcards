"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createFlashcard } from "@/lib/api";
import { cn } from "@/lib/utils";
import PageContainer from "@/components/layout/page-container";
import { FlashcardMarkdownToolbar } from "@/components/flashcard-markdown-toolbar";
import { FlashcardImageField } from "@/components/flashcard-image-field";

interface AddCardPageProps {
  params: { id: string };
}

export default function AddCardPage({ params }: AddCardPageProps) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [answerShort, setAnswerShort] = useState("");
  const [answerExample, setAnswerExample] = useState("");
  const [answerDetailed, setAnswerDetailed] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const answerExampleRef = useRef<HTMLTextAreaElement>(null);
  const answerDetailedRef = useRef<HTMLTextAreaElement>(null);

  const cardTextareaClass = cn(
    "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base text-start transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm resize-y"
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await createFlashcard({
        deck_id: params.id,
        question,
        answer_short: answerShort,
        answer_example:
          answerExample.trim() === "" ? undefined : answerExample.trim(),
        answer_detailed:
          answerDetailed.trim() === "" ? undefined : answerDetailed.trim(),
        image_url: imageUrl,
        difficulty,
      });

      router.push(`/decks/${params.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

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
        <Card>
          <CardHeader>
            <CardTitle>Add Card</CardTitle>
            <CardDescription>
              Create a new flashcard for this deck
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <FlashcardImageField
                value={imageUrl}
                onChange={setImageUrl}
                disabled={submitting}
              />
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
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                {submitting ? "Adding..." : "Add Card"}
              </Button>
            </form>
          </CardContent>
        </Card>
    </PageContainer>
  );
}
