import Link from "next/link";
import { BookOpen, Layers } from "lucide-react";
import PageContainer from "@/components/layout/page-container";

export default function StudyPage() {
  return (
    <PageContainer>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
        <p className="text-sm text-muted-foreground">
          Choose a deck or category to review.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/decks"
          className="group rounded-xl border border-neutral-200 dark:border-neutral-700 p-5 sm:p-6 hover:bg-muted/40 active:bg-muted/60 transition-colors"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 group-hover:bg-neutral-200 dark:group-hover:bg-neutral-700 transition-colors">
              <Layers className="w-5 h-5 text-foreground" />
            </div>
            <h2 className="text-base font-semibold">Review a Deck</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Pick a single deck and review its due flashcards.
          </p>
          <span className="inline-flex items-center mt-4 text-sm font-medium text-foreground group-hover:underline">
            Browse decks →
          </span>
        </Link>

        <Link
          href="/decks"
          className="group rounded-xl border border-neutral-200 dark:border-neutral-700 p-5 sm:p-6 hover:bg-muted/40 active:bg-muted/60 transition-colors"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 group-hover:bg-neutral-200 dark:group-hover:bg-neutral-700 transition-colors">
              <BookOpen className="w-5 h-5 text-foreground" />
            </div>
            <h2 className="text-base font-semibold">Review a Category</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Review all decks in a category, one after another.
          </p>
          <span className="inline-flex items-center mt-4 text-sm font-medium text-foreground group-hover:underline">
            Browse categories →
          </span>
        </Link>
      </div>
    </PageContainer>
  );
}
