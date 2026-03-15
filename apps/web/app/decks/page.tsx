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
  FolderInput,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
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
import { getUsers, getDecks, getCategories, updateDeck, createCategory, updateCategory, deleteCategory, deleteDeck, moveDeckToCategory, apiUrl } from "@/lib/api";
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
      className={`rounded-lg transition-all ${isOver ? "ring-2 ring-primary/40 bg-primary/5" : ""} ${className ?? ""}`}
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
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameCategoryId, setRenameCategoryId] = useState<string | null>(null);
  const [renameCategoryName, setRenameCategoryName] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [openDeckMenuId, setOpenDeckMenuId] = useState<string | null>(null);
  const [moveModalDeckId, setMoveModalDeckId] = useState<string | null>(null);
  const [moveModalCategoryId, setMoveModalCategoryId] = useState<string | null>(null);
  const [moveModalSaving, setMoveModalSaving] = useState(false);
  const [renameDeckModalOpen, setRenameDeckModalOpen] = useState(false);
  const [renameDeckId, setRenameDeckId] = useState<string | null>(null);
  const [renameDeckName, setRenameDeckName] = useState("");
  const [renameDeckSaving, setRenameDeckSaving] = useState(false);
  const [deleteDeckConfirmId, setDeleteDeckConfirmId] = useState<string | null>(null);
  const [deleteDeckError, setDeleteDeckError] = useState<string | null>(null);

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
    if (!userId) {
      setCategories([]);
      return;
    }
    const uid = userId;
    async function fetchCategories() {
      try {
        const data = await getCategories(uid);
        setCategories(Array.isArray(data) ? data : []);
      } catch {
        setCategories([]);
      }
    }
    fetchCategories();
  }, [userId, refreshKey]);

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
    if (!name || categoryCreating || !userId) return;
    try {
      setCategoryCreating(true);
      await createCategory({ name, user_id: userId });
      setCategoryName("");
      setCategoryModalOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to create category", err);
    } finally {
      setCategoryCreating(false);
    }
  }

  function openRenameModal(categoryId: string, currentName: string) {
    setRenameCategoryId(categoryId);
    setRenameCategoryName(currentName);
    setRenameModalOpen(true);
  }

  function closeRenameModal() {
    if (!renameSaving) {
      setRenameModalOpen(false);
      setRenameCategoryId(null);
      setRenameCategoryName("");
    }
  }

  async function handleRenameCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = renameCategoryName.trim();
    if (!name || !renameCategoryId || renameSaving || !userId) return;
    try {
      setRenameSaving(true);
      await updateCategory(renameCategoryId, { name }, userId);
      setRefreshKey((k) => k + 1);
      closeRenameModal();
    } catch (err) {
      console.error("Failed to rename category", err);
    } finally {
      setRenameSaving(false);
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    if (!userId) return;
    setDeleteError(null);
    try {
      await deleteCategory(categoryId, userId);
      setRefreshKey((k) => k + 1);
      setDeleteConfirmId(null);
    } catch (err) {
      console.error("Failed to delete category", err);
      setDeleteError(err instanceof Error ? err.message : "Failed to delete category");
    }
  }

  function openMoveModal(deckId: string) {
    const deck = decks.find((d) => d.id === deckId);
    setMoveModalDeckId(deckId);
    setMoveModalCategoryId(deck?.category_id ?? null);
    setOpenDeckMenuId(null);
  }

  function closeMoveModal() {
    if (!moveModalSaving) {
      setMoveModalDeckId(null);
      setMoveModalCategoryId(null);
    }
  }

  async function handleMoveDeck(e: React.FormEvent) {
    e.preventDefault();
    if (!moveModalDeckId || moveModalSaving) return;
    try {
      setMoveModalSaving(true);
      await moveDeckToCategory(moveModalDeckId, moveModalCategoryId);
      closeMoveModal();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to move deck", err);
    } finally {
      setMoveModalSaving(false);
    }
  }

  function openRenameDeckModal(deckId: string) {
    const deck = decks.find((d) => d.id === deckId);
    setRenameDeckId(deckId);
    setRenameDeckName(deck?.name ?? "");
    setRenameDeckModalOpen(true);
    setOpenDeckMenuId(null);
  }

  function closeRenameDeckModal() {
    if (!renameDeckSaving) {
      setRenameDeckModalOpen(false);
      setRenameDeckId(null);
      setRenameDeckName("");
    }
  }

  async function handleRenameDeck(e: React.FormEvent) {
    e.preventDefault();
    const name = renameDeckName.trim();
    if (!name || !renameDeckId || renameDeckSaving) return;
    try {
      setRenameDeckSaving(true);
      await updateDeck(renameDeckId, { name });
      setRefreshKey((k) => k + 1);
      closeRenameDeckModal();
    } catch (err) {
      console.error("Failed to rename deck", err);
    } finally {
      setRenameDeckSaving(false);
    }
  }

  function openDeleteDeckConfirm(deckId: string) {
    setDeleteDeckConfirmId(deckId);
    setDeleteDeckError(null);
    setOpenDeckMenuId(null);
  }

  async function handleDeleteDeck() {
    if (!deleteDeckConfirmId) return;
    try {
      setDeleteDeckError(null);
      await deleteDeck(deleteDeckConfirmId);
      setDecks((d) => d.filter((deck) => deck.id !== deleteDeckConfirmId));
      setDeleteDeckConfirmId(null);
    } catch (err) {
      console.error("Failed to delete deck", err);
      setDeleteDeckError(err instanceof Error ? err.message : "Failed to delete deck");
    }
  }

  useEffect(() => {
    function handleClickOutside() {
      setOpenDeckMenuId(null);
    }
    if (openDeckMenuId) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [openDeckMenuId]);

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

        {renameModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={closeRenameModal}
          >
            <div
              className="bg-background rounded-lg shadow-lg p-6 w-full max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-4">Rename Category</h2>
              <form onSubmit={handleRenameCategory} className="space-y-4">
                <Input
                  placeholder="Category name"
                  value={renameCategoryName}
                  onChange={(e) => setRenameCategoryName(e.target.value)}
                  disabled={renameSaving}
                  autoFocus
                  className="w-full"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeRenameModal}
                    disabled={renameSaving}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!renameCategoryName.trim() || renameSaving}>
                    {renameSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {deleteConfirmId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => { setDeleteConfirmId(null); setDeleteError(null); }}
          >
            <div
              className="bg-background rounded-lg shadow-lg p-6 w-full max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-2">Delete this category?</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Decks will not be deleted. They will move to &quot;Uncategorized&quot;.
              </p>
              {deleteError && (
                <p className="text-sm text-destructive mb-4">{deleteError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteConfirmId(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteConfirmId && handleDeleteCategory(deleteConfirmId)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}

        {moveModalDeckId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={closeMoveModal}
          >
            <div
              className="bg-background rounded-lg shadow-lg p-6 w-full max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-4">Move Deck to Category</h2>
              <form onSubmit={handleMoveDeck} className="space-y-4">
                <div>
                  <label htmlFor="move-category" className="sr-only">
                    Category
                  </label>
                  <select
                    id="move-category"
                    value={moveModalCategoryId ?? UNCATEGORIZED}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMoveModalCategoryId(v === UNCATEGORIZED ? null : v);
                    }}
                    disabled={moveModalSaving}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[44px] max-mobile:min-h-[48px]"
                  >
                    <option value={UNCATEGORIZED}>Uncategorized</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeMoveModal}
                    disabled={moveModalSaving}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={moveModalSaving}>
                    {moveModalSaving ? "Moving..." : "Move"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {renameDeckModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={closeRenameDeckModal}
          >
            <div
              className="bg-background rounded-lg shadow-lg p-6 w-full max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-4">Rename deck</h2>
              <form onSubmit={handleRenameDeck} className="space-y-4">
                <Input
                  placeholder="Deck name"
                  value={renameDeckName}
                  onChange={(e) => setRenameDeckName(e.target.value)}
                  disabled={renameDeckSaving}
                  autoFocus
                  className="w-full"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeRenameDeckModal}
                    disabled={renameDeckSaving}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!renameDeckName.trim() || renameDeckSaving}>
                    {renameDeckSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {deleteDeckConfirmId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => { setDeleteDeckConfirmId(null); setDeleteDeckError(null); }}
          >
            <div
              className="bg-background rounded-lg shadow-lg p-6 w-full max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-2">Delete this deck?</h2>
              <p className="text-sm text-muted-foreground mb-4">
                This will permanently delete the deck and all its flashcards.
              </p>
              {deleteDeckError && (
                <p className="text-sm text-destructive mb-4">{deleteDeckError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteDeckConfirmId(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteDeck}
                >
                  Delete
                </Button>
              </div>
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
                  <div
                    className={`group flex items-center justify-between mb-2 ${idx === 0 ? "mt-0" : "mt-6"}`}
                  >
                    <h2 className="text-xs font-medium text-muted-foreground tracking-wide">
                      {group.categoryName}
                    </h2>
                    {group.categoryId !== UNCATEGORIZED && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openRenameModal(group.categoryId, group.categoryName);
                          }}
                          className="p-1 rounded hover:bg-muted/60"
                          aria-label="Rename category"
                        >
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(group.categoryId);
                          }}
                          className="p-1 rounded hover:bg-muted/60"
                          aria-label="Delete category"
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 max-mobile:space-y-2.5 pl-4">
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
                          className="deck-card rounded-xl border border-neutral-200 px-5 py-5 flex items-center justify-between gap-3 bg-white hover:bg-muted/40 hover:shadow-sm transition-colors dark:bg-neutral-900 dark:border-neutral-700 cursor-pointer max-mobile:px-4 max-mobile:py-3.5 max-mobile:rounded-[12px]"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {(() => {
                              const statusIcon = getGenerationStatusIcon(deck);
                              const StatusIcon = statusIcon?.icon;
                              return statusIcon && StatusIcon ? (
                                <Tooltip>
                                  <TooltipTrigger
                                    className="inline-flex shrink-0"
                                    aria-label={statusIcon.tooltip}
                                  >
                                    <StatusIcon
                                      className={`w-4 h-4 text-muted-foreground ${statusIcon.spin ? "animate-spin" : ""}`}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent>{statusIcon.tooltip}</TooltipContent>
                                </Tooltip>
                              ) : null;
                            })()}
                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="font-medium text-base leading-snug max-mobile:text-[16px] max-mobile:font-semibold">
                                {deck.name}
                              </span>
                              <span className="text-sm text-muted-foreground max-mobile:text-[13px] max-mobile:text-[#777] dark:max-mobile:text-neutral-400">
                                {deck.card_count ?? 0} {deck.card_count === 1 ? "card" : "cards"}
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-0.5 max-mobile:opacity-60">
                            <div className="relative">
                              <Button
                                variant="ghost"
                                size="icon"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setOpenDeckMenuId((prev) => (prev === deck.id ? null : deck.id));
                                }}
                                className="text-muted-foreground hover:text-foreground"
                                aria-label="Deck actions"
                                aria-expanded={openDeckMenuId === deck.id}
                              >
                                <MoreVertical className="size-4" />
                              </Button>
                              {openDeckMenuId === deck.id && (
                                <div
                                  className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-border bg-background py-1 shadow-lg"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted max-mobile:min-h-[44px] max-mobile:py-3"
                                    onClick={() => openMoveModal(deck.id)}
                                  >
                                    <FolderInput className="size-4 shrink-0" />
                                    Move to category
                                  </button>
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted max-mobile:min-h-[44px] max-mobile:py-3"
                                    onClick={() => openRenameDeckModal(deck.id)}
                                  >
                                    <Pencil className="size-4 shrink-0" />
                                    Rename deck
                                  </button>
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10 max-mobile:min-h-[44px] max-mobile:py-3"
                                    onClick={() => openDeleteDeckConfirm(deck.id)}
                                  >
                                    <Trash2 className="size-4 shrink-0" />
                                    Delete deck
                                  </button>
                                </div>
                              )}
                            </div>
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