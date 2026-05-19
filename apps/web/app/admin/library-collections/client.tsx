"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adminAddDeckToLibraryCollection,
  adminCreateLibraryCollection,
  adminDeleteLibraryCollection,
  adminGetLibraryCollection,
  adminListAllLibraryCollections,
  adminRemoveDeckFromLibraryCollection,
  adminReorderDeckInLibraryCollection,
  adminUpdateLibraryCollection,
  getLibraryDecks,
  type LibraryCollectionDetail,
  type LibraryCollectionSummary,
} from "@/lib/api";

interface PublicDeckLite {
  id: string;
  name: string;
  description: string | null;
  card_count: number;
}

/**
 * Admin surface for curated library collections. All mutations route through
 * /api/proxy which injects the signed acting-user header; the backend enforces the
 * platform-admin gate, so the worst case if a non-admin reaches this UI is a 403.
 */
export function AdminLibraryCollectionsClient() {
  const [collections, setCollections] = useState<LibraryCollectionSummary[]>([]);
  const [selected, setSelected] = useState<LibraryCollectionDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    setListLoading(true);
    try {
      const data = await adminListAllLibraryCollections();
      setCollections(data);
      setListError(null);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load collections");
      setCollections([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const data = await adminGetLibraryCollection(id);
      setSelected(data);
      setDetailError(null);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Failed to load collection");
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (selectedId) {
      refreshDetail(selectedId);
    } else {
      setSelected(null);
    }
  }, [selectedId, refreshDetail]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Library collections</h1>
          <p className="text-sm text-muted-foreground">
            Curated groupings of public decks shown on the Library page. Distinct from
            personal categories in My Decks.
          </p>
        </div>
        <CreateCollectionInline
          onCreated={async (created) => {
            await refreshList();
            setSelectedId(created.id);
          }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <aside className="rounded-lg border border-border/70 bg-card">
          <div className="border-b border-border/70 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Collections
          </div>
          {listLoading ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
          ) : listError ? (
            <p className="px-3 py-4 text-sm text-destructive">{listError}</p>
          ) : collections.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No collections yet. Use “New collection” to create one.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {collections.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                      selectedId === c.id
                        ? "bg-muted text-foreground"
                        : "hover:bg-muted/40 text-foreground"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{c.title}</span>
                        {c.is_published ? (
                          <span
                            className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            title="Published"
                          >
                            Live
                          </span>
                        ) : (
                          <span
                            className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                            title="Draft (not visible publicly)"
                          >
                            Draft
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.deck_count} deck{c.deck_count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 opacity-60" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="rounded-lg border border-border/70 bg-card">
          {!selectedId ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              Select a collection on the left, or create a new one.
            </p>
          ) : detailLoading ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">Loading collection…</p>
          ) : detailError || !selected ? (
            <p className="px-4 py-8 text-sm text-destructive">
              {detailError ?? "Collection not found."}
            </p>
          ) : (
            <CollectionEditor
              collection={selected}
              onMutated={async () => {
                await refreshList();
                if (selectedId) await refreshDetail(selectedId);
              }}
              onDeleted={async () => {
                setSelectedId(null);
                await refreshList();
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------ */
/* Create collection (inline form on the page header)                                   */
/* ------------------------------------------------------------------------------------ */

function CreateCollectionInline({
  onCreated,
}: {
  onCreated: (collection: LibraryCollectionSummary) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-9"
      >
        <Plus className="mr-1.5 size-4" aria-hidden />
        New collection
      </Button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) {
          setError("Title is required");
          return;
        }
        setSaving(true);
        try {
          const created = await adminCreateLibraryCollection({ title: trimmed });
          setTitle("");
          setOpen(false);
          setError(null);
          await onCreated(created);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to create collection");
        } finally {
          setSaving(false);
        }
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Collection title"
        className="h-9 min-w-[14rem]"
        maxLength={150}
      />
      <Button type="submit" size="sm" disabled={saving} className="h-9">
        {saving ? "Creating…" : "Create"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setOpen(false);
          setTitle("");
          setError(null);
        }}
        className="h-9"
      >
        Cancel
      </Button>
      {error ? (
        <span className="w-full text-xs text-destructive">{error}</span>
      ) : null}
    </form>
  );
}

/* ------------------------------------------------------------------------------------ */
/* Editor for a single collection (title / description / publish + deck membership)     */
/* ------------------------------------------------------------------------------------ */

function CollectionEditor({
  collection,
  onMutated,
  onDeleted,
}: {
  collection: LibraryCollectionDetail;
  onMutated: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
}) {
  return (
    <div className="space-y-6 p-4">
      <CollectionMetaForm collection={collection} onMutated={onMutated} onDeleted={onDeleted} />
      <CollectionDeckList collection={collection} onMutated={onMutated} />
      <AddDeckPanel collection={collection} onMutated={onMutated} />
    </div>
  );
}

function CollectionMetaForm({
  collection,
  onMutated,
  onDeleted,
}: {
  collection: LibraryCollectionDetail;
  onMutated: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState(collection.title);
  const [description, setDescription] = useState(collection.description ?? "");
  const [isPublished, setIsPublished] = useState(collection.is_published);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(collection.title);
    setDescription(collection.description ?? "");
    setIsPublished(collection.is_published);
  }, [collection.id, collection.title, collection.description, collection.is_published]);

  const dirty =
    title.trim() !== collection.title.trim() ||
    description.trim() !== (collection.description ?? "").trim() ||
    isPublished !== collection.is_published;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div className="flex-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="lc-title">
            Title
          </label>
          <Input
            id="lc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9"
            maxLength={150}
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              setBusy(true);
              try {
                await adminUpdateLibraryCollection(collection.id, {
                  is_published: !isPublished,
                });
                setIsPublished(!isPublished);
                await onMutated();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to toggle publish");
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="h-9"
            title={isPublished ? "Currently visible on Library" : "Currently a draft"}
          >
            {isPublished ? (
              <>
                <Eye className="mr-1.5 size-4" aria-hidden />
                Live
              </>
            ) : (
              <>
                <EyeOff className="mr-1.5 size-4" aria-hidden />
                Draft
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              if (
                !window.confirm(
                  `Delete collection “${collection.title}”? Decks themselves will NOT be deleted; only the grouping is removed.`,
                )
              ) {
                return;
              }
              setBusy(true);
              try {
                await adminDeleteLibraryCollection(collection.id);
                await onDeleted();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to delete collection");
                setBusy(false);
              }
            }}
            disabled={busy}
            className="h-9 text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1.5 size-4" aria-hidden />
            Delete
          </Button>
        </div>
      </div>
      <div>
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="lc-description"
        >
          Description
        </label>
        <textarea
          id="lc-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={3}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          placeholder="Short summary shown on the Library page."
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await adminUpdateLibraryCollection(collection.id, {
                title: title.trim(),
                description: description.trim(),
              });
              setError(null);
              await onMutated();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to save");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    </div>
  );
}

function CollectionDeckList({
  collection,
  onMutated,
}: {
  collection: LibraryCollectionDetail;
  onMutated: () => Promise<void> | void;
}) {
  const [busyDeckId, setBusyDeckId] = useState<string | null>(null);

  if (collection.decks.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
        No decks in this collection yet. Add one below.
      </div>
    );
  }

  const last = collection.decks.length - 1;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Decks</h3>
      <ul className="divide-y divide-border/60 rounded-md border border-border/70">
        {collection.decks.map((deck, idx) => (
          <li
            key={deck.id}
            className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  {idx + 1}.
                </span>
                <span className="truncate font-medium">{deck.name}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {deck.card_count} card{deck.card_count === 1 ? "" : "s"}
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={async () => {
                  setBusyDeckId(deck.id);
                  try {
                    await adminReorderDeckInLibraryCollection(
                      collection.id,
                      deck.id,
                      "up",
                    );
                    await onMutated();
                  } finally {
                    setBusyDeckId(null);
                  }
                }}
                disabled={idx === 0 || busyDeckId === deck.id}
                className="size-8"
                aria-label="Move up"
              >
                <ArrowUp className="size-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={async () => {
                  setBusyDeckId(deck.id);
                  try {
                    await adminReorderDeckInLibraryCollection(
                      collection.id,
                      deck.id,
                      "down",
                    );
                    await onMutated();
                  } finally {
                    setBusyDeckId(null);
                  }
                }}
                disabled={idx === last || busyDeckId === deck.id}
                className="size-8"
                aria-label="Move down"
              >
                <ArrowDown className="size-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={async () => {
                  setBusyDeckId(deck.id);
                  try {
                    await adminRemoveDeckFromLibraryCollection(collection.id, deck.id);
                    await onMutated();
                  } finally {
                    setBusyDeckId(null);
                  }
                }}
                disabled={busyDeckId === deck.id}
                className="size-8 text-destructive hover:text-destructive"
                aria-label="Remove from collection"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddDeckPanel({
  collection,
  onMutated,
}: {
  collection: LibraryCollectionDetail;
  onMutated: () => Promise<void> | void;
}) {
  const [publicDecks, setPublicDecks] = useState<PublicDeckLite[] | null>(null);
  const [search, setSearch] = useState("");
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedOnceRef = useRef(false);

  const memberIds = useMemo(
    () => new Set(collection.decks.map((d) => d.id)),
    [collection.decks],
  );

  useEffect(() => {
    if (loadedOnceRef.current) return;
    loadedOnceRef.current = true;
    setLoadingDecks(true);
    getLibraryDecks()
      .then((data) => {
        setPublicDecks(Array.isArray(data) ? data : []);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load public decks");
        setPublicDecks([]);
      })
      .finally(() => setLoadingDecks(false));
  }, []);

  const candidates = useMemo(() => {
    if (!publicDecks) return [];
    const q = search.trim().toLowerCase();
    return publicDecks
      .filter((d) => !memberIds.has(d.id))
      .filter((d) =>
        !q ||
        d.name.toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [publicDecks, memberIds, search]);

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Add a public deck</h3>
      <div className="space-y-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search public decks by name…"
          className="h-9"
        />
        {loadingDecks ? (
          <p className="text-sm text-muted-foreground">Loading public decks…</p>
        ) : !publicDecks || publicDecks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No public decks available. Make a deck public from its detail page first.
          </p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {search.trim() ? "No matching public decks." : "All public decks are already in this collection."}
          </p>
        ) : (
          <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-md border border-border/70">
            {candidates.map((deck) => (
              <li
                key={deck.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{deck.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {deck.card_count} card{deck.card_count === 1 ? "" : "s"}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={adding !== null}
                  onClick={async () => {
                    setAdding(deck.id);
                    setError(null);
                    try {
                      await adminAddDeckToLibraryCollection(collection.id, deck.id);
                      await onMutated();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Failed to add deck");
                    } finally {
                      setAdding(null);
                    }
                  }}
                >
                  {adding === deck.id ? (
                    "Adding…"
                  ) : (
                    <>
                      <Check className="mr-1.5 size-4" aria-hidden />
                      Add
                    </>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
