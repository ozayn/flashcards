"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { createFlashcard } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AddCardPageProps {
  params: { id: string };
}

export default function AddCardPage({ params }: AddCardPageProps) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [answerShort, setAnswerShort] = useState("");
  const [answerDetailed, setAnswerDetailed] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await createFlashcard({
        deck_id: params.id,
        question,
        answer_short: answerShort,
        answer_detailed: answerDetailed || undefined,
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
    <main className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto space-y-6">
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
              <div className="space-y-2">
                <label htmlFor="question" className="text-sm font-medium">
                  Question
                </label>
                <textarea
                  id="question"
                  dir="auto"
                  required
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. What is the capital of France?"
                  rows={3}
                  className={cn(
                    "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base text-start transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm"
                  )}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="answerShort" className="text-sm font-medium">
                  Short Answer
                </label>
                <Input
                  id="answerShort"
                  dir="auto"
                  required
                  value={answerShort}
                  onChange={(e) => setAnswerShort(e.target.value)}
                  placeholder="e.g. Paris"
                  className="text-start"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="answerDetailed" className="text-sm font-medium">
                  Detailed Answer (optional)
                </label>
                <textarea
                  id="answerDetailed"
                  dir="auto"
                  value={answerDetailed}
                  onChange={(e) => setAnswerDetailed(e.target.value)}
                  placeholder="Additional context or explanation..."
                  rows={3}
                  className={cn(
                    "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base text-start transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm"
                  )}
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
      </div>
    </main>
  );
}
