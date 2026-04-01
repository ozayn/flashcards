"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, LayoutGrid, List, Search } from "lucide-react";
import { getCategoryDecks, getCategories } from "@/lib/api";
import { getStoredUserId } from "@/components/user-selector";
import PageContainer from "@/components/layout/page-container";
import { DeckGenerationBadge } from "@/components/DeckGenerationBadge";

interface CategoryPageProps {
  params: { categoryId: string };
}

interface CategoryDeck {
  id: string;
  name: string;
  description?: string | null;
  card_count?: number;
  created_at?: string;
  category_assigned_at?: string | null;
  generation_status?: string;
  is_public?: boolean;
}

type SortMode = "category_order" | "newest" | "oldest" | "az";

export default function CategoryPage({ params }: CategoryPageProps) {
  const router = useRouter();
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [decks, setDecks] = useState<CategoryDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [deckLayout, setDeckLayout] = useState<"list" | "grid">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("category_order");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("flashcards_deck_layout");
      if (stored === "grid" || stored === "list") setDeckLayout(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const switchDeckLayout = useCallback((layout: "list" | "grid") => {
    setDeckLayout(layout);
    try {
      localStorage.setItem("flashcards_deck_layout", layout);
    } catch {
      /* ignore */
    }
  }, []);

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

  const filteredDecks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return decks;
    return decks.filter((d) => {
      if (d.name.toLowerCase().includes(q)) return true;
      if (d.description && d.description.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [decks, searchQuery]);

  const visibleDecks = useMemo(() => {
    const list = [...filteredDecks];
    if (sortMode === "category_order") return list;
    if (sortMode === "newest") {
      list.sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
    } else if (sortMode === "oldest") {
      list.sort(
        (a, b) =>
          new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [filteredDecks, sortMode]);

  function renderDeckRow(deck: CategoryDeck) {
    return (
      <div
        key={deck.id}
        role="link"
        tabIndex={0}
        onClick={() => router.push(`/decks/${deck.id}`)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push(`/decks/${deck.id}`);
          }
        }}
        className="deck-card group rounded-lg border border-border px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors cursor-pointer max-mobile:px-3.5 max-mobile:py-3"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-medium text-sm leading-snug truncate">{deck.name}</span>
              <DeckGenerationBadge status={deck.generation_status} />
            </div>
            <span className="text-xs text-muted-foreground">
              {deck.card_count ?? 0} {(deck.card_count ?? 0) === 1 ? "card" : "cards"}
              {deck.is_public && (
                <>
                  {" "}
                  · <span className="text-emerald-600 dark:text-emerald-400">Public</span>
                </>
              )}
            </span>
          </div>
        </div>
      </div>
    );
  }

  function renderDeckTile(deck: CategoryDeck) {
    return (
      <div
        key={deck.id}
        role="link"
        tabIndex={0}
        onClick={() => router.push(`/decks/${deck.id}`)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push(`/decks/${deck.id}`);
          }
        }}
        className="group relative rounded-xl border border-border bg-background p-4 flex flex-col gap-2 hover:bg-muted/30 transition-colors cursor-pointer max-mobile:p-3.5"
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 min-w-0 flex-1">{deck.name}</h3>
          <DeckGenerationBadge status={deck.generation_status} />
        </div>
        {deck.description ? (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{deck.description}</p>
        ) : null}
        <div className="flex items-center gap-2 mt-auto pt-1 text-xs text-muted-foreground">
          <span>
            {deck.card_count ?? 0} {(deck.card_count ?? 0) === 1 ? "card" : "cards"}
          </span>
          {deck.is_public && (
            <>
              {" "}
              · <span className="text-emerald-600 dark:text-emerald-400">Public</span>
            </>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 md:px-8 pt-4 sm:pt-6">
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
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 md:px-8 pt-4 sm:pt-6 pb-12">
        <Link
          href="/decks"
          className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted w-fit"
        >
          ← Back to decks
        </Link>

        <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">{categoryName ?? "Category"}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {decks.length} deck{decks.length !== 1 ? "s" : ""}
              {totalCards > 0 && (
                <>
                  {" "}
                  · {totalCards} card{totalCards !== 1 ? "s" : ""}
                </>
              )}
            </p>
          </div>
          {decks.length > 0 && (
            <div className="flex gap-2 shrink-0">
              <Link
                href={`/explore/category/${params.categoryId}`}
                className="inline-flex h-10 items-center gap-2 justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 active:opacity-80 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-4 text-sm font-medium"
              >
                <Eye className="size-4" />
                Explore
              </Link>
              <Link
                href={`/study/category/${params.categoryId}`}
                className="inline-flex h-10 items-center gap-2 justify-center rounded-lg border border-border hover:bg-muted active:opacity-80 px-4 text-sm font-medium"
              >
                Quiz
              </Link>
            </div>
          )}
        </div>

        {decks.length > 0 && (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="relative flex-1 min-w-0 sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search decks in this category…"
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div
                className="inline-flex rounded-lg border border-border/50 bg-muted/30 p-0.5"
                role="radiogroup"
                aria-label="Deck layout"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={deckLayout === "list"}
                  onClick={() => switchDeckLayout("list")}
                  className={`rounded-md p-1 transition-colors ${
                    deckLayout === "list"
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-label="List view"
                >
                  <List className="size-3.5" />
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={deckLayout === "grid"}
                  onClick={() => switchDeckLayout("grid")}
                  className={`rounded-md p-1 transition-colors ${
                    deckLayout === "grid"
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-label="Grid view"
                >
                  <LayoutGrid className="size-3.5" />
                </button>
              </div>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                aria-label="Sort decks"
                className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="category_order">Category order</option>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="az">A–Z</option>
              </select>
            </div>
          </div>
        )}

        {decks.length === 0 ? (
          <p className="text-muted-foreground mt-8 text-center">No decks in this category yet.</p>
        ) : filteredDecks.length === 0 ? (
          <p className="text-muted-foreground mt-8 text-center">
            No decks match &ldquo;{searchQuery.trim()}&rdquo;.
          </p>
        ) : deckLayout === "grid" ? (
          <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {visibleDecks.map((deck) => renderDeckTile(deck))}
          </div>
        ) : (
          <div className="mt-6 sm:mt-8 space-y-1.5">{visibleDecks.map((deck) => renderDeckRow(deck))}</div>
        )}
      </div>
    </PageContainer>
  );
}
