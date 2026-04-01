"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { getLibraryDecks } from "@/lib/api";
import PageContainer from "@/components/layout/page-container";

interface LibraryDeck {
  id: string;
  name: string;
  description: string | null;
  source_type: string | null;
  source_topic: string | null;
  card_count: number;
  created_at: string;
}

const _SOURCE_LABELS: Record<string, string> = {
  youtube: "YouTube",
  wikipedia: "Wikipedia",
  url: "URL",
  topic: "Topic",
  text: "Text",
  pdf: "PDF",
};

export default function LibraryPage() {
  const [decks, setDecks] = useState<LibraryDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await getLibraryDecks();
        setDecks(Array.isArray(data) ? data : []);
      } catch {
        setDecks([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? decks.filter(
        (d) =>
          d.name.toLowerCase().includes(query) ||
          (d.description ?? "").toLowerCase().includes(query) ||
          (d.source_topic ?? "").toLowerCase().includes(query)
      )
    : decks;

  return (
    <PageContainer>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Public flashcard decks you can explore, review, and save to your own collection.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading library…</p>
      ) : decks.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <BookOpen className="size-10 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground">
            No public decks available yet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {decks.length > 4 && (
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search library…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No decks match your search.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((deck) => (
                <Link
                  key={deck.id}
                  href={`/decks/${deck.id}`}
                  className="group rounded-xl border border-neutral-200 bg-white dark:bg-neutral-900 dark:border-neutral-700 p-4 flex flex-col gap-2 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-base leading-snug line-clamp-2">
                      {deck.name}
                    </h3>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Public
                    </span>
                  </div>
                  {deck.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                      {deck.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-auto pt-1 text-xs text-muted-foreground">
                    <span>{deck.card_count} card{deck.card_count === 1 ? "" : "s"}</span>
                    {deck.source_type && _SOURCE_LABELS[deck.source_type] && (
                      <span>Source: {_SOURCE_LABELS[deck.source_type]}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}
