"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import {
  Archive,
  ArchiveRestore,
  CircleAlert,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getUsers, getDecks, getCategories, updateDeck, createCategory, apiUrl } from "@/lib/api";
import { getStoredUserId } from "@/components/user-selector";
import PageContainer from "@/components/layout/page-container";

export type Deck = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  source_type: string | null;
  source_url: string | null;
  source_text: string | null;
  generation_status?: string;
  generated_by_ai?: boolean;
  archived: boolean;
  created_at: string;
  card_count?: number;
  category_id?: string | null;
};

export type Category = {
  id: string;
  name: string;
  user_id: string | null;
  created_at: string;
};

const GENERATION_STATUS_CONFIG: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; tooltip: string; spin?: boolean }
> = {
  generating: { icon: Loader2, tooltip: "Generating flashcards...", spin: true },
  failed: { icon: CircleAlert, tooltip: "Generation failed" },
};

type DeckMetadata = {
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  spin?: boolean;
};

function getGenerationStatusIcon(deck: Deck): DeckMetadata | null {
  if (deck.generation_status === "completed" || !deck.generation_status) return null;
  return GENERATION_STATUS_CONFIG[deck.generation_status] ?? null;
}

const UNCATEGORIZED = "__uncategorized__";

function resolveDropTargetCategoryId(
  overId: string,
  decks: Deck[],
  categoryIds: string[]
): string | null {
  if (overId === UNCATEGORIZED || categoryIds.includes(overId)) return overId;
  const deck = decks.find((d) => d.id === overId);
  if (deck) return deck.category_id ?? UNCATEGORIZED;
  return null;
}

function groupDecksByCategory(
  decks: Deck[],
  categories: Category[]
): { categoryId: string; categoryName: string; decks: Deck[] }[] {
  const groups = new Map<string, Deck[]>();

  for (const deck of decks) {
    const key = deck.category_id ?? UNCATEGORIZED;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(deck);
  }

  const result: { categoryId: string; categoryName: string; decks: Deck[] }[] = [];

  if (groups.has(UNCATEGORIZED)) {
    result.push({
      categoryId: UNCATEGORIZED,
      categoryName: "Uncategorized",
      decks: groups.get(UNCATEGORIZED)!,
    });
  }

  for (const cat of categories) {
    result.push({
      categoryId: cat.id,
      categoryName: cat.name,
      decks: groups.get(cat.id) ?? [],
    });
  }

  return result;
}

function DroppableCategory({
  id,
  children,
  isOver,
  className,
}: {
  id: string;
  children: React.ReactNode;
  isOver: boolean;
  className?: string;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg transition-all ${isOver ? "ring-2 ring-primary/40 ring-offset-2 ring-offset-background" : ""} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function DraggableDeckRow({
  deck,
  children,
  isDragging,
}: {
  deck: Deck;
  children: React.ReactNode;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: deck.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`touch-none ${isDragging ? "opacity-50 cursor-grabbing" : "cursor-grab"}`}
    >
      {children}
    </div>
  );
}

export default function DecksPage() {
  const router = useRouter();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [decksError, setDecksError] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryCreating, setCategoryCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    async function resolveUserId() {
      const stored = getStoredUserId();
      if (stored) {
        setUserId(stored);
        return;
      }
      try {
        const users = await getUsers();
        if (Array.isArray(users) && users.length > 0) {
          setUserId(users[0].id);
        }
      } catch {
        setUserId(null);
      }
    }
    resolveUserId();
  }, []);

  useEffect(() => {
    const handleUserChanged = () => setUserId(getStoredUserId());
    window.addEventListener("flashcard_user_changed", handleUserChanged);
    return () => window.removeEventListener("flashcard_user_changed", handleUserChanged);
  }, []);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const data = await getCategories();
        setCategories(Array.isArray(data) ? data : []);
      } catch {
        setCategories([]);
      }
    }
    fetchCategories();
  }, [refreshKey]);

  useEffect(() => {
    if (!userId) {
      setDecks([]);
      return;
    }
    const uid = userId;
    async function fetchDecks() {
      try {
        setDecksError(false);
        const data = await getDecks(uid, showArchived);
        setDecks(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load decks", err);
        setDecks([]);
        setDecksError(true);
      }
    }
    fetchDecks();
  }, [userId, showArchived, refreshKey]);

  async function handleArchiveDeck(deckId: string, archive: boolean, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await updateDeck(deckId, { archived: archive });
      setDecks((d) => d.filter((deck) => deck.id !== deckId));
    } catch {
      // ignore
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    if (!event.over || event.active.id === event.over.id) {
      setDragOverId(null);
      return;
    }
    setDragOverId(String(event.over.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDragOverId(null);
    setActiveDragId(null);
    if (!over) return;
    const deckId = String(active.id);
    const categoryIds = [UNCATEGORIZED, ...categories.map((c) => c.id)];
    const newCategoryId = resolveDropTargetCategoryId(
      String(over.id),
      decks,
      categoryIds
    );
    if (!newCategoryId) return;
    const deck = decks.find((d) => d.id === deckId);
    if (!deck || (deck.category_id ?? UNCATEGORIZED) === newCategoryId) return;
    try {
      await updateDeck(deckId, {
        category_id: newCategoryId === UNCATEGORIZED ? null : newCategoryId,
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to move deck", err);
    }
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = categoryName.trim();
    if (!name || categoryCreating) return;
    try {
      setCategoryCreating(true);
      await createCategory({ name });
      setCategoryName("");
      setCategoryModalOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to create category", err);
    } finally {
      setCategoryCreating(false);
    }
  }

  return (
    <PageContainer>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Decks</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCategoryModalOpen(true)}
              className="h-10"
            >
              New Category
            </Button>
            <Link
              href="/create-deck"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              Create Deck
            </Link>
          </div>
        </div>

        {categoryModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => !categoryCreating && setCategoryModalOpen(false)}
          >
            <div
              className="bg-background rounded-lg shadow-lg p-6 w-full max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-4">New Category</h2>
              <form onSubmit={handleCreateCategory} className="space-y-4">
                <Input
                  placeholder="Category name"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  disabled={categoryCreating}
                  autoFocus
                  className="w-full"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => !categoryCreating && setCategoryModalOpen(false)}
                    disabled={categoryCreating}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!categoryName.trim() || categoryCreating}>
                    {categoryCreating ? "Creating..." : "Create"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        <p className="text-muted-foreground text-sm">
          Your flashcard decks will appear here.
        </p>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-input"
          />
          Show archived decks
        </label>

        <div className="space-y-3">
          {decksError ? (
            <Card>
              <CardHeader>
                <CardTitle>Unable to load decks</CardTitle>
                <CardDescription>
                  The API may be unavailable. Ensure the backend is running and refresh the page. Configured API: {apiUrl}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : decks.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  {showArchived ? "No archived decks" : "Getting Started"}
                </CardTitle>
                <CardDescription>
                  {showArchived
                    ? "Archived decks will appear here."
                    : "Create your first deck to get started"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!showArchived && (
                  <Link
                    href="/create-deck"
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
                  >
                    Create Deck
                  </Link>
                )}
              </CardContent>
            </Card>
          ) : (
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              {groupDecksByCategory(decks, categories).map((group, idx) => {
                const sourceCategoryId = activeDragId
                  ? (decks.find((d) => d.id === activeDragId)?.category_id ?? UNCATEGORIZED)
                  : null;
                const isDropTarget =
                  (dragOverId === group.categoryId ||
                    (!!dragOverId &&
                      group.decks.some((d) => d.id === dragOverId))) &&
                  group.categoryId !== sourceCategoryId;
                return (
                <DroppableCategory
                  key={group.categoryId}
                  id={group.categoryId}
                  isOver={isDropTarget}
                >
                  <h2 className={`text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2 ${idx === 0 ? "mt-0" : "mt-6"}`}>
                    {group.categoryName}
                  </h2>
                  <div className="space-y-3">
                    {group.decks.map((deck) => (
                      <DraggableDeckRow
                        key={deck.id}
                        deck={deck}
                        isDragging={activeDragId === deck.id}
                      >
                        <div
                          role="link"
                          tabIndex={0}
                          onClick={() => router.push(`/decks/${deck.id}`)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              router.push(`/decks/${deck.id}`);
                            }
                          }}
                          className="rounded-xl border border-neutral-200 px-5 py-5 flex items-center justify-between gap-3 bg-white hover:bg-muted/40 transition-colors dark:bg-neutral-900 dark:border-neutral-700 cursor-pointer"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {(() => {
                              const statusIcon = getGenerationStatusIcon(deck);
                              const StatusIcon = statusIcon?.icon;
                              return statusIcon && StatusIcon ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex shrink-0">
                                      <StatusIcon
                                        className={`w-4 h-4 text-muted-foreground ${statusIcon.spin ? "animate-spin" : ""}`}
                                      />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>{statusIcon.tooltip}</TooltipContent>
                                </Tooltip>
                              ) : null;
                            })()}
                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="font-medium text-base leading-snug">
                                {deck.name}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {deck.card_count ?? 0} {deck.card_count === 1 ? "card" : "cards"}
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleArchiveDeck(deck.id, !showArchived, e);
                              }}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label={showArchived ? "Unarchive deck" : "Archive deck"}
                            >
                              {showArchived ? (
                                <ArchiveRestore className="size-4" />
                              ) : (
                                <Archive className="size-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </DraggableDeckRow>
                    ))}
                  </div>
                </DroppableCategory>
              );
              })}
            </DndContext>
          )}
        </div>
    </PageContainer>
  );
}