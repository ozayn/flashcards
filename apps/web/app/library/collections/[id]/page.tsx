"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, FolderOpen } from "lucide-react";
import PageContainer from "@/components/layout/page-container";
import {
  getLibraryCollectionDetail,
  type LibraryCollectionDetail,
} from "@/lib/api";

interface CollectionPageProps {
  params: { id: string };
}

const SOURCE_LABELS: Record<string, string> = {
  youtube: "YouTube",
  wikipedia: "Wikipedia",
  url: "URL",
  topic: "Topic",
  text: "Text",
  pdf: "PDF",
};

/**
 * Public collection page. Hits `GET /library-collections/{id}` which 404s for
 * unpublished collections, so signed-out viewers cannot stumble onto drafts via the URL.
 *
 * Renders the curated deck list in admin order (junction `position`). Decks that have
 * since been archived or made private are filtered out server-side, so this view only
 * ever shows links the visitor can actually open.
 */
export default function LibraryCollectionPage({ params }: CollectionPageProps) {
  const [collection, setCollection] = useState<LibraryCollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getLibraryCollectionDetail(params.id);
        if (!cancelled) {
          setCollection(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load collection";
          setError(msg);
          setCollection(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  return (
    <PageContainer>
      <div>
        <Link
          href="/library"
          className="inline-flex h-8 items-center gap-1.5 -ml-2 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/80"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Library
        </Link>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading collection…</p>
      ) : error || !collection ? (
        <div className="text-center py-16 space-y-3">
          <FolderOpen className="size-10 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground">
            {error ?? "Collection not found."}
          </p>
          <Link
            href="/library"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm text-foreground hover:bg-muted/40"
          >
            Back to Library
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">{collection.title}</h1>
            {collection.description ? (
              <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                {collection.description}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {collection.deck_count} deck{collection.deck_count === 1 ? "" : "s"}
              {collection.total_card_count > 0 ? (
                <>
                  {" · "}
                  {collection.total_card_count} card
                  {collection.total_card_count === 1 ? "" : "s"} total
                </>
              ) : null}
            </p>
          </div>

          {collection.decks.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              This collection has no published decks yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {collection.decks.map((deck, idx) => (
                <Link
                  key={deck.id}
                  href={`/decks/${deck.id}`}
                  className="group rounded-xl border border-neutral-200 bg-white dark:bg-neutral-900 dark:border-neutral-700 p-4 flex flex-col gap-2 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-base leading-snug line-clamp-2">
                      <span
                        className="mr-1.5 text-xs font-medium text-muted-foreground tabular-nums"
                        aria-hidden
                      >
                        {idx + 1}.
                      </span>
                      {deck.name}
                    </h3>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Public
                    </span>
                  </div>
                  {deck.description ? (
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                      {deck.description}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-3 mt-auto pt-1 text-xs text-muted-foreground">
                    <span>
                      {deck.card_count} card{deck.card_count === 1 ? "" : "s"}
                    </span>
                    {deck.source_type && SOURCE_LABELS[deck.source_type] ? (
                      <span>Source: {SOURCE_LABELS[deck.source_type]}</span>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
