import Link from "next/link";
import { BookOpen, Layers } from "lucide-react";
import PageContainer from "@/components/layout/page-container";

export default function StudyPage() {
  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold tracking-tight">Review</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/decks"
          className="group rounded-xl border border-border p-5 hover:bg-muted/40 active:bg-muted/60 transition-colors"
        >
          <div className="flex items-center gap-3 mb-2">
            <Layers className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium">Review a Deck</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Pick a deck and review its due cards.
          </p>
        </Link>

        <Link
          href="/decks"
          className="group rounded-xl border border-border p-5 hover:bg-muted/40 active:bg-muted/60 transition-colors"
        >
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium">Review a Category</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Review all decks in a category sequentially.
          </p>
        </Link>
      </div>
    </PageContainer>
  );
}
