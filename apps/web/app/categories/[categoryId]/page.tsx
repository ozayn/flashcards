"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCategoryDecks, getCategories } from "@/lib/api";
import { getStoredUserId } from "@/components/user-selector";
import PageContainer from "@/components/layout/page-container";

interface CategoryPageProps {
  params: { categoryId: string };
}

interface CategoryDeck {
  id: string;
  name: string;
  card_count: number;
  category_assigned_at?: string | null;
}

export default function CategoryPage({ params }: CategoryPageProps) {
  const router = useRouter();
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [decks, setDecks] = useState<CategoryDeck[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = getStoredUserId();
    if (!userId) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const [deckData, categories] = await Promise.all([
          getCategoryDecks(params.categoryId, userId!),
          getCategories(userId!),
        ]);
        setDecks(Array.isArray(deckData) ? deckData : []);
        const cat = (categories as { id: string; name: string }[])?.find(
          (c) => c.id === params.categoryId
        );
        setCategoryName(cat?.name ?? null);
      } catch {
        setDecks([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.categoryId]);

  if (loading) {
    return (
      <PageContainer>
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 pt-4 sm:pt-6">
          <Link
            href="/decks"
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted w-fit"
          >
            ← Back to decks
          </Link>
          <p className="text-muted-foreground mt-4">Loading category...</p>
        </div>
      </PageContainer>
    );
  }

  const totalCards = decks.reduce((n, d) => n + (d.card_count ?? 0), 0);

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 pt-4 sm:pt-6 pb-12">
        <Link
          href="/decks"
          className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted w-fit"
        >
          ← Back to decks
        </Link>

        <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">
              {categoryName ?? "Category"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {decks.length} deck{decks.length !== 1 ? "s" : ""}
              {totalCards > 0 && <> · {totalCards} card{totalCards !== 1 ? "s" : ""}</>}
            </p>
          </div>
          <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden shrink-0 w-full sm:w-auto">
            <span
              className="inline-flex h-10 sm:h-9 items-center justify-center px-4 text-sm font-medium bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 flex-1 sm:flex-none cursor-default"
              aria-current="page"
            >
              Explore
            </span>
            {decks.length > 0 ? (
              <Link
                href={`/study/category/${params.categoryId}`}
                className="inline-flex h-10 sm:h-9 items-center justify-center gap-1.5 px-4 text-sm font-medium bg-background text-muted-foreground hover:text-foreground hover:bg-muted active:opacity-80 transition-colors flex-1 sm:flex-none border-l border-neutral-200 dark:border-neutral-700"
              >
                <BookOpen className="size-3.5" />
                Study
              </Link>
            ) : (
              <span className="inline-flex h-10 sm:h-9 items-center justify-center gap-1.5 px-4 text-sm font-medium bg-background text-muted-foreground/40 cursor-not-allowed flex-1 sm:flex-none border-l border-neutral-200 dark:border-neutral-700">
                <BookOpen className="size-3.5" />
                Study
              </span>
            )}
          </div>
        </div>

        {decks.length === 0 ? (
          <p className="text-muted-foreground mt-8 text-center">
            No decks in this category yet.
          </p>
        ) : (
          <div className="mt-6 sm:mt-8 space-y-2 sm:space-y-3">
            {decks.map((deck) => (
              <div
                key={deck.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/decks/${deck.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") router.push(`/decks/${deck.id}`);
                }}
                className="rounded-xl border border-neutral-200 dark:border-neutral-700 px-4 py-3 sm:px-5 sm:py-4 hover:bg-muted/40 active:bg-muted/60 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-[15px]">{deck.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {deck.card_count ?? 0} card{(deck.card_count ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
