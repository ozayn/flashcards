"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
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
  ArrowRightLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FolderInput,
  LayoutGrid,
  List,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getUsers,
  getDecks,
  getCategories,
  updateDeck,
  createCategory,
  updateCategory,
  deleteCategory,
  deleteDeck,
  moveDeckToCategory,
  reorderCategoryDeck,
  getAdminLegacyBulkTransferPreview,
  type LegacyBulkTransferPreview,
} from "@/lib/api";
import { getStoredUserId } from "@/components/user-selector";
import PageContainer from "@/components/layout/page-container";
import { DeckGenerationBadge } from "@/components/DeckGenerationBadge";
import { DeckActionsMenu } from "@/components/DeckActionsMenu";
import {
  DeckStudyStatusPillMenu,
  StudyStatusIcon,
} from "@/components/DeckStudyStatusPillMenu";
import { AdminTransferDeckConfirmModal } from "@/components/AdminTransferDeckConfirmModal";
import { AdminBulkLegacyTransferConfirmModal } from "@/components/AdminBulkLegacyTransferConfirmModal";
import { formatDeckCreatedCalendarDate } from "@/lib/format-deck-date";
import {
  coerceDeckStudyStatus,
  deckStudyStatusTriggerClass,
  DECK_STUDY_STATUSES,
  DECK_STUDY_STATUS_LABELS,
  type DeckStudyStatus,
} from "@/lib/deck-study-status";
import { cn } from "@/lib/utils";

const SHOW_DECK_DATES_STORAGE_KEY = "flashcards_deck_show_dates";

export type Deck = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  source_type: string | null;
  source_url: string | null;
  source_topic?: string | null;
  source_text: string | null;
  generation_status?: string;
  generated_by_ai?: boolean;
  archived: boolean;
  is_public?: boolean;
  created_at: string;
  card_count?: number;
  category_id?: string | null;
  /** Manual order within category (0..n-1); null = legacy / fallback sort. */
  category_position?: number | null;
  category_assigned_at?: string | null;
  owner_is_legacy?: boolean;
  owner_name?: string | null;
  owner_email?: string | null;
  /** User-set workflow marker (not review progress). */
  study_status?: string | null;
};

function showMoveToMyAccountForDeck(
  deck: Deck,
  sessionStatus: string,
  isPlatformAdmin: boolean,
  backendUserId: string | undefined
): boolean {
  return (
    sessionStatus === "authenticated" &&
    isPlatformAdmin &&
    Boolean(deck.owner_is_legacy) &&
    Boolean(backendUserId) &&
    deck.user_id !== backendUserId
  );
}

export type Category = {
  id: string;
  name: string;
  user_id: string | null;
  created_at: string;
};

const UNCATEGORIZED = "__uncategorized__";

function DeckListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 max-mobile:space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-border px-4 py-3.5 bg-muted/40 animate-pulse"
        >
          <div className="h-5 bg-muted-foreground/15 rounded w-[min(100%,14rem)] mb-2" />
          <div className="h-4 bg-muted-foreground/10 rounded w-24" />
        </div>
      ))}
    </div>
  );
}

function normalizeCategoryName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

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

function _deckCategoryLegacySortKey(d: Deck): number {
  const s = d.category_assigned_at ?? d.created_at ?? "";
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

/** Match API category deck order: explicit positions first, then assigned/created time. */
function compareDeckWithinCategoryOrder(a: Deck, b: Deck): number {
  const aNull = a.category_position == null;
  const bNull = b.category_position == null;
  if (!aNull && !bNull && a.category_position !== b.category_position) {
    return (a.category_position as number) - (b.category_position as number);
  }
  if (!aNull && bNull) return -1;
  if (aNull && !bNull) return 1;
  return _deckCategoryLegacySortKey(a) - _deckCategoryLegacySortKey(b);
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
    const unc = groups.get(UNCATEGORIZED)!;
    result.push({
      categoryId: UNCATEGORIZED,
      categoryName: "Uncategorized",
      decks: [...unc].sort(
        (a, b) => _deckCategoryLegacySortKey(b) - _deckCategoryLegacySortKey(a)
      ),
    });
  }

  for (const cat of categories) {
    const raw = groups.get(cat.id) ?? [];
    result.push({
      categoryId: cat.id,
      categoryName: cat.name,
      decks: [...raw].sort(compareDeckWithinCategoryOrder),
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
  className,
}: {
  deck: Deck;
  children: React.ReactNode;
  isDragging: boolean;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: deck.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`touch-none ${isDragging ? "opacity-50 cursor-grabbing" : "cursor-grab"} ${className ?? ""}`}
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
  const [userResolved, setUserResolved] = useState(false);
  const [decksLoading, setDecksLoading] = useState(false);
  const [decksError, setDecksError] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryCreating, setCategoryCreating] = useState(false);
  const [categoryCreateError, setCategoryCreateError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameCategoryId, setRenameCategoryId] = useState<string | null>(null);
  const [renameCategoryName, setRenameCategoryName] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameCategoryError, setRenameCategoryError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [openDeckMenuId, setOpenDeckMenuId] = useState<string | null>(null);
  const [openCategoryActionsId, setOpenCategoryActionsId] = useState<string | null>(null);
  const [filtersMenuOpen, setFiltersMenuOpen] = useState(false);
  const [moveModalDeckId, setMoveModalDeckId] = useState<string | null>(null);
  const [moveModalCategoryId, setMoveModalCategoryId] = useState<string | null>(null);
  const [moveModalSaving, setMoveModalSaving] = useState(false);
  const [moveModalShowNewCatInput, setMoveModalShowNewCatInput] = useState(false);
  const [moveModalNewCatName, setMoveModalNewCatName] = useState("");
  const [moveModalNewCatError, setMoveModalNewCatError] = useState<string | null>(null);
  const [moveModalCreatingCat, setMoveModalCreatingCat] = useState(false);
  const [renameDeckModalOpen, setRenameDeckModalOpen] = useState(false);
  const [renameDeckId, setRenameDeckId] = useState<string | null>(null);
  const [renameDeckName, setRenameDeckName] = useState("");
  const [renameDeckSaving, setRenameDeckSaving] = useState(false);
  const [deleteDeckConfirmId, setDeleteDeckConfirmId] = useState<string | null>(null);
  const [deleteDeckError, setDeleteDeckError] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [studyStatusFilter, setStudyStatusFilter] = useState<"all" | DeckStudyStatus>("all");
  const [viewMode, setViewMode] = useState<"grouped" | "all">("grouped");
  const [sortMode, setSortMode] = useState<"newest" | "oldest" | "az">("newest");
  const [deckLayout, setDeckLayout] = useState<"list" | "grid">("list");
  const [showDeckDates, setShowDeckDates] = useState(false);
  const moveFeedbackClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [moveFeedbackDeckId, setMoveFeedbackDeckId] = useState<string | null>(null);
  const [moveFeedbackText, setMoveFeedbackText] = useState<string | null>(null);
  const [adminTransferTarget, setAdminTransferTarget] = useState<Deck | null>(null);
  const [bulkLegacyTransferModalOpen, setBulkLegacyTransferModalOpen] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<LegacyBulkTransferPreview | null>(null);
  const [bulkPreviewLoading, setBulkPreviewLoading] = useState(false);
  const { data: session, status: sessionStatus } = useSession();
  const isPlatformAdmin = Boolean(session?.isPlatformAdmin);

  const showBulkLegacyTransferAction =
    sessionStatus === "authenticated" &&
    isPlatformAdmin &&
    Boolean(session?.backendUserId) &&
    Boolean(userId) &&
    userId !== session.backendUserId &&
    Boolean(bulkPreview?.is_legacy_user) &&
    !bulkPreviewLoading &&
    (bulkPreview?.deck_count ?? 0) > 0;

  useEffect(() => {
    try {
      const stored = localStorage.getItem("flashcards_collapsed_categories");
      if (stored) setCollapsedCategories(new Set(JSON.parse(stored)));
    } catch {}
    try {
      const stored = localStorage.getItem("flashcards_deck_layout");
      if (stored === "grid" || stored === "list") setDeckLayout(stored);
    } catch {}
    try {
      const d = localStorage.getItem(SHOW_DECK_DATES_STORAGE_KEY);
      if (d === "1" || d === "true") setShowDeckDates(true);
    } catch {}
  }, []);

  const toggleCollapsed = useCallback((categoryId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      try {
        localStorage.setItem(
          "flashcards_collapsed_categories",
          JSON.stringify(Array.from(next))
        );
      } catch {}
      return next;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  /** Refetch deck list without toggling decksLoading (avoids jarring full-page style reload on category move). */
  const refetchDecksSilently = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getDecks(userId, showArchived);
      if (Array.isArray(data)) setDecks(data);
    } catch (e) {
      console.error("Failed to refresh decks", e);
    }
  }, [userId, showArchived]);

  useEffect(() => {
    async function resolveUserId() {
      try {
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
      } finally {
        setUserResolved(true);
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
    if (
      !userId ||
      sessionStatus !== "authenticated" ||
      !isPlatformAdmin ||
      !session?.backendUserId ||
      userId === session.backendUserId
    ) {
      setBulkPreview(null);
      setBulkPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setBulkPreviewLoading(true);
    void (async () => {
      try {
        const p = await getAdminLegacyBulkTransferPreview(userId);
        if (!cancelled) setBulkPreview(p);
      } catch {
        if (!cancelled) setBulkPreview(null);
      } finally {
        if (!cancelled) setBulkPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, sessionStatus, isPlatformAdmin, session?.backendUserId, refreshKey]);

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
      setDecksLoading(false);
      return;
    }
    const uid = userId;
    let cancelled = false;
    async function fetchDecks() {
      setDecksLoading(true);
      setDecksError(false);
      try {
        const data = await getDecks(uid, showArchived);
        if (!cancelled) {
          setDecks(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to load decks", err);
        if (!cancelled) {
          setDecks([]);
          setDecksError(true);
        }
      } finally {
        if (!cancelled) setDecksLoading(false);
      }
    }
    fetchDecks();
    return () => {
      cancelled = true;
    };
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

  async function handleTogglePublic(deckId: string, makePublic: boolean) {
    try {
      await updateDeck(deckId, { is_public: makePublic });
      setDecks((prev) =>
        prev.map((d) => (d.id === deckId ? { ...d, is_public: makePublic } : d))
      );
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
      const updated = (await updateDeck(deckId, {
        category_id: newCategoryId === UNCATEGORIZED ? null : newCategoryId,
      })) as Deck;
      setDecks((prev) =>
        prev.map((d) => (d.id === deckId ? { ...d, ...updated } : d))
      );
      showDeckMoveFeedback(
        deckId,
        newCategoryId === UNCATEGORIZED ? null : newCategoryId
      );
      void refetchDecksSilently();
    } catch (err) {
      console.error("Failed to move deck", err);
    }
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = categoryName.trim();
    if (!name || categoryCreating || !userId) return;
    const normalized = normalizeCategoryName(name);
    const isDuplicate = categories.some(
      (c) => normalizeCategoryName(c.name) === normalized
    );
    if (isDuplicate) {
      setCategoryCreateError("This category already exists.");
      return;
    }
    setCategoryCreateError(null);
    try {
      setCategoryCreating(true);
      await createCategory({ name, user_id: userId });
      setCategoryName("");
      setCategoryModalOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setCategoryCreateError(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setCategoryCreating(false);
    }
  }

  function openRenameModal(categoryId: string, currentName: string) {
    setRenameCategoryId(categoryId);
    setRenameCategoryName(currentName);
    setRenameCategoryError(null);
    setRenameModalOpen(true);
  }

  function closeRenameModal() {
    if (!renameSaving) {
      setRenameModalOpen(false);
      setRenameCategoryId(null);
      setRenameCategoryName("");
      setRenameCategoryError(null);
    }
  }

  async function handleRenameCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = renameCategoryName.trim();
    if (!name || !renameCategoryId || renameSaving || !userId) return;
    const normalized = normalizeCategoryName(name);
    const isDuplicate = categories.some(
      (c) => c.id !== renameCategoryId && normalizeCategoryName(c.name) === normalized
    );
    if (isDuplicate) {
      setRenameCategoryError("This category already exists.");
      return;
    }
    setRenameCategoryError(null);
    try {
      setRenameSaving(true);
      await updateCategory(renameCategoryId, { name }, userId);
      setRefreshKey((k) => k + 1);
      closeRenameModal();
    } catch (err) {
      setRenameCategoryError(err instanceof Error ? err.message : "Failed to rename category");
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
    setMoveModalShowNewCatInput(false);
    setMoveModalNewCatName("");
    setMoveModalNewCatError(null);
    setOpenDeckMenuId(null);
  }

  function closeMoveModal() {
    if (!moveModalSaving && !moveModalCreatingCat) {
      setMoveModalDeckId(null);
      setMoveModalCategoryId(null);
      setMoveModalShowNewCatInput(false);
      setMoveModalNewCatName("");
      setMoveModalNewCatError(null);
    }
  }

  async function handleMoveDeckCreateCategory() {
    if (!userId || moveModalCreatingCat) return;
    const trimmed = moveModalNewCatName.trim();
    if (!trimmed) {
      setMoveModalNewCatError("Category name cannot be empty.");
      return;
    }
    const normalized = normalizeCategoryName(trimmed);
    const duplicate = categories.find(
      (c) => normalizeCategoryName(c.name) === normalized
    );
    if (duplicate) {
      setMoveModalCategoryId(duplicate.id);
      setMoveModalShowNewCatInput(false);
      setMoveModalNewCatName("");
      setMoveModalNewCatError(null);
      return;
    }
    setMoveModalCreatingCat(true);
    setMoveModalNewCatError(null);
    try {
      const created = await createCategory({ name: trimmed, user_id: userId });
      const catId = (created as { id: string }).id;
      const cats = await getCategories(userId);
      setCategories(Array.isArray(cats) ? cats : []);
      setMoveModalCategoryId(catId);
      setMoveModalShowNewCatInput(false);
      setMoveModalNewCatName("");
    } catch (err) {
      setMoveModalNewCatError(
        err instanceof Error ? err.message : "Failed to create category."
      );
    } finally {
      setMoveModalCreatingCat(false);
    }
  }

  async function handleMoveDeck(e: React.FormEvent) {
    e.preventDefault();
    if (!moveModalDeckId || moveModalSaving) return;
    const deckId = moveModalDeckId;
    const before = decks.find((d) => d.id === deckId);
    try {
      setMoveModalSaving(true);
      const updated = (await moveDeckToCategory(
        deckId,
        moveModalCategoryId
      )) as Deck;
      setDecks((prev) =>
        prev.map((d) => (d.id === deckId ? { ...d, ...updated } : d))
      );
      const changed =
        (before?.category_id ?? null) !== (updated.category_id ?? null);
      closeMoveModal();
      if (changed) {
        showDeckMoveFeedback(deckId, updated.category_id ?? null);
      }
      void refetchDecksSilently();
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
      setOpenCategoryActionsId(null);
      setFiltersMenuOpen(false);
    }
    if (openDeckMenuId || openCategoryActionsId || filtersMenuOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [openDeckMenuId, openCategoryActionsId, filtersMenuOpen]);

  useEffect(() => {
    return () => {
      if (moveFeedbackClearRef.current) {
        clearTimeout(moveFeedbackClearRef.current);
        moveFeedbackClearRef.current = null;
      }
    };
  }, []);

  const categoryNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) map.set(cat.id, cat.name);
    return map;
  }, [categories]);

  const showDeckMoveFeedback = useCallback(
    (deckId: string, targetCategoryId: string | null) => {
      if (moveFeedbackClearRef.current) {
        clearTimeout(moveFeedbackClearRef.current);
        moveFeedbackClearRef.current = null;
      }
      const label = !targetCategoryId
        ? "Uncategorized"
        : categoryNameMap.get(targetCategoryId) ?? "category";
      setMoveFeedbackText(`Moved to ${label}`);
      setMoveFeedbackDeckId(deckId);
      moveFeedbackClearRef.current = setTimeout(() => {
        setMoveFeedbackText(null);
        setMoveFeedbackDeckId(null);
        moveFeedbackClearRef.current = null;
      }, 2200);
    },
    [categoryNameMap]
  );

  const filteredDecks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = decks;
    if (q) {
      list = list.filter((d) => {
        if (d.name.toLowerCase().includes(q)) return true;
        const catName = d.category_id ? categoryNameMap.get(d.category_id) : null;
        if (catName && catName.toLowerCase().includes(q)) return true;
        return false;
      });
    }
    if (studyStatusFilter !== "all") {
      list = list.filter(
        (d) => coerceDeckStudyStatus(d.study_status) === studyStatusFilter
      );
    }
    return list;
  }, [decks, searchQuery, categoryNameMap, studyStatusFilter]);

  const sortedFlatDecks = useMemo(() => {
    const sorted = [...filteredDecks];
    if (sortMode === "newest") sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    else if (sortMode === "oldest") sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [filteredDecks, sortMode]);

  const showDeckListSkeleton =
    !userResolved || (Boolean(userId) && decksLoading);

  function switchDeckLayout(layout: "list" | "grid") {
    setDeckLayout(layout);
    try {
      localStorage.setItem("flashcards_deck_layout", layout);
    } catch {
      /* ignore */
    }
  }

  function renderDeckMenu(deck: Deck, menuCategoryId?: string | null) {
    const menuOpen = openDeckMenuId === deck.id;
    const showCategoryReorderInMenu =
      Boolean(menuCategoryId) &&
      menuCategoryId !== UNCATEGORIZED &&
      viewMode === "grouped";

    const decksOrderedInMenuCategory =
      showCategoryReorderInMenu && menuCategoryId
        ? decks
            .filter((d) => d.category_id === menuCategoryId)
            .sort(compareDeckWithinCategoryOrder)
        : [];

    const idxInCategory = showCategoryReorderInMenu
      ? decksOrderedInMenuCategory.findIndex((d) => d.id === deck.id)
      : -1;
    const nInCategory = decksOrderedInMenuCategory.length;
    const canReorderInCategory =
      showCategoryReorderInMenu && idxInCategory >= 0 && nInCategory > 0;
    const canMoveUpInCategory = canReorderInCategory && idxInCategory > 0;
    const canMoveDownInCategory =
      canReorderInCategory && idxInCategory >= 0 && idxInCategory < nInCategory - 1;

    return (
      <DeckActionsMenu
        open={menuOpen}
        onOpenChange={(next) => setOpenDeckMenuId(next ? deck.id : null)}
        triggerClassName={`relative deck-menu-button opacity-70 hover:opacity-100 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 max-mobile:opacity-100 ${menuOpen ? "!opacity-100" : ""}`}
      >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center justify-start gap-2.5 whitespace-nowrap px-3 py-2.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background max-mobile:min-h-[44px] max-mobile:py-3"
              onClick={() => openMoveModal(deck.id)}
            >
              <FolderInput className="size-4 shrink-0" aria-hidden />
              <span>Move to category</span>
            </button>
            {showCategoryReorderInMenu && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canMoveUpInCategory}
                  className="flex w-full items-center justify-start gap-2.5 whitespace-nowrap px-3 py-2.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background max-mobile:min-h-[44px] max-mobile:py-3 disabled:pointer-events-none disabled:opacity-45"
                  onClick={() => {
                    if (!userId || !menuCategoryId || !canMoveUpInCategory) return;
                    setOpenDeckMenuId(null);
                    void (async () => {
                      try {
                        await reorderCategoryDeck(menuCategoryId, deck.id, "up", userId);
                        setRefreshKey((k) => k + 1);
                      } catch (err) {
                        console.error(err);
                      }
                    })();
                  }}
                >
                  <ChevronUp className="size-4 shrink-0" aria-hidden />
                  <span>Move up</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canMoveDownInCategory}
                  className="flex w-full items-center justify-start gap-2.5 whitespace-nowrap px-3 py-2.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background max-mobile:min-h-[44px] max-mobile:py-3 disabled:pointer-events-none disabled:opacity-45"
                  onClick={() => {
                    if (!userId || !menuCategoryId || !canMoveDownInCategory) return;
                    setOpenDeckMenuId(null);
                    void (async () => {
                      try {
                        await reorderCategoryDeck(menuCategoryId, deck.id, "down", userId);
                        setRefreshKey((k) => k + 1);
                      } catch (err) {
                        console.error(err);
                      }
                    })();
                  }}
                >
                  <ChevronDown className="size-4 shrink-0" aria-hidden />
                  <span>Move down</span>
                </button>
              </>
            )}
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center justify-start gap-2.5 whitespace-nowrap px-3 py-2.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background max-mobile:min-h-[44px] max-mobile:py-3"
              onClick={() => openRenameDeckModal(deck.id)}
            >
              <Pencil className="size-4 shrink-0" aria-hidden />
              <span>Rename deck</span>
            </button>
            {showMoveToMyAccountForDeck(
              deck,
              sessionStatus,
              isPlatformAdmin,
              session?.backendUserId
            ) && (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center justify-start gap-2.5 whitespace-nowrap px-3 py-2.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background max-mobile:min-h-[44px] max-mobile:py-3"
                onClick={() => {
                  setOpenDeckMenuId(null);
                  setAdminTransferTarget(deck);
                }}
              >
                <ArrowRightLeft className="size-4 shrink-0" aria-hidden />
                <span>Move to my account</span>
              </button>
            )}
            {sessionStatus === "authenticated" && (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center justify-start gap-2.5 whitespace-nowrap px-3 py-2.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background max-mobile:min-h-[44px] max-mobile:py-3"
                onClick={() => {
                  setOpenDeckMenuId(null);
                  handleTogglePublic(deck.id, !deck.is_public);
                }}
              >
                {deck.is_public ? (
                  <EyeOff className="size-4 shrink-0" aria-hidden />
                ) : (
                  <Eye className="size-4 shrink-0" aria-hidden />
                )}
                <span>
                  {deck.is_public ? "Remove from Library" : "Add to Library"}
                </span>
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center justify-start gap-2.5 whitespace-nowrap px-3 py-2.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background max-mobile:min-h-[44px] max-mobile:py-3"
              onClick={(e) => {
                setOpenDeckMenuId(null);
                handleArchiveDeck(deck.id, !showArchived, e);
              }}
            >
              {showArchived ? (
                <ArchiveRestore className="size-4 shrink-0" aria-hidden />
              ) : (
                <Archive className="size-4 shrink-0" aria-hidden />
              )}
              <span>{showArchived ? "Unarchive" : "Archive"}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center justify-start gap-2.5 whitespace-nowrap px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background max-mobile:min-h-[44px] max-mobile:py-3"
              onClick={() => openDeleteDeckConfirm(deck.id)}
            >
              <Trash2 className="size-4 shrink-0" aria-hidden />
              <span>Delete deck</span>
            </button>
      </DeckActionsMenu>
    );
  }

  function renderDeckRow(deck: Deck, menuCategoryId?: string | null) {
    const dateShort =
      showDeckDates ? formatDeckCreatedCalendarDate(deck.created_at) : null;
    const categoryLabel =
      viewMode === "all" && deck.category_id && categoryNameMap.has(deck.category_id)
        ? categoryNameMap.get(deck.category_id)
        : null;
    return (
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
        className={cn(
          "deck-card group rounded-lg border border-border px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors cursor-pointer max-mobile:px-3 max-mobile:py-2.5 max-mobile:gap-2",
          moveFeedbackDeckId === deck.id && "deck-moved-highlight ring-1 ring-emerald-500/25"
        )}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0 max-mobile:gap-2">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="font-semibold text-sm leading-snug truncate max-mobile:text-base">
              {deck.name}
            </span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="tabular-nums shrink-0">
                {deck.card_count ?? 0} {deck.card_count === 1 ? "card" : "cards"}
              </span>
              <DeckGenerationBadge status={deck.generation_status} />
              <span className="text-muted-foreground/40" aria-hidden>
                ·
              </span>
              <DeckStudyStatusPillMenu
                studyStatus={coerceDeckStudyStatus(deck.study_status)}
                density="list"
                onSelect={async (study_status) => {
                  await updateDeck(deck.id, { study_status });
                  setDecks((prev) =>
                    prev.map((d) => (d.id === deck.id ? { ...d, study_status } : d))
                  );
                }}
              />
              {categoryLabel && (
                <>
                  <span className="text-muted-foreground/40" aria-hidden>
                    ·
                  </span>
                  <span className="min-w-0 truncate">{categoryLabel}</span>
                </>
              )}
              {dateShort && (
                <>
                  <span className="text-muted-foreground/40" aria-hidden>
                    ·
                  </span>
                  <span className="text-muted-foreground/80 shrink-0">{dateShort}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-0.5 max-mobile:opacity-100">
          {renderDeckMenu(deck, menuCategoryId)}
        </div>
      </div>
    );
  }

  function renderDeckTile(deck: Deck, menuCategoryId?: string | null) {
    const dateShort =
      showDeckDates ? formatDeckCreatedCalendarDate(deck.created_at) : null;
    const narrowGrid = viewMode === "grouped";
    const categoryLabel =
      viewMode === "all" && deck.category_id && categoryNameMap.has(deck.category_id)
        ? categoryNameMap.get(deck.category_id)
        : null;

    const metaRow = (
      <div className="flex min-w-0 flex-nowrap items-center gap-x-1 overflow-hidden text-muted-foreground text-[10px] leading-tight sm:text-[11px]">
        <span className="shrink-0 tabular-nums">
          {deck.card_count ?? 0} {(deck.card_count ?? 0) === 1 ? "card" : "cards"}
        </span>
        <DeckGenerationBadge status={deck.generation_status} />
        <span className="shrink-0 text-muted-foreground/40" aria-hidden>
          ·
        </span>
        <DeckStudyStatusPillMenu
          studyStatus={coerceDeckStudyStatus(deck.study_status)}
          density="grid"
          onSelect={async (study_status) => {
            await updateDeck(deck.id, { study_status });
            setDecks((prev) =>
              prev.map((d) => (d.id === deck.id ? { ...d, study_status } : d))
            );
          }}
        />
        {categoryLabel && (
          <>
            <span className="shrink-0 text-muted-foreground/40" aria-hidden>
              ·
            </span>
            <span className="min-w-0 flex-1 truncate" title={categoryLabel}>
              {categoryLabel}
            </span>
          </>
        )}
        {dateShort && (
          <>
            <span className="shrink-0 text-muted-foreground/40" aria-hidden>
              ·
            </span>
            <span
              className="shrink-0 truncate text-muted-foreground/80 max-w-[42%]"
              title={dateShort}
            >
              {dateShort}
            </span>
          </>
        )}
      </div>
    );

    return (
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
        className={cn(
          "group relative flex h-full min-h-[7.5rem] w-full min-w-0 cursor-pointer flex-col rounded-md border border-border bg-background p-2 transition-colors hover:bg-muted/30 sm:min-h-[8rem] sm:rounded-lg sm:p-2.5",
          moveFeedbackDeckId === deck.id && "deck-moved-highlight ring-1 ring-emerald-500/20"
        )}
      >
        <div className="pointer-events-none absolute right-1 top-1 z-10">
          <div
            className="pointer-events-auto shrink-0 [&_button]:h-7 [&_button]:w-7"
            onClick={(e: MouseEvent) => e.stopPropagation()}
            onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
          >
            {renderDeckMenu(deck, menuCategoryId)}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col pr-8 pt-0.5">
          <h3
            title={deck.name}
            className={`line-clamp-2 min-h-[2.5rem] shrink-0 break-words font-semibold leading-snug text-foreground sm:min-h-[2.75rem] md:min-h-[3rem] ${
              narrowGrid
                ? "text-[11px] sm:text-xs md:text-sm md:min-h-[2.75rem]"
                : "text-xs sm:text-sm md:text-base"
            }`}
          >
            {deck.name}
          </h3>
          <div className="min-h-[2px] flex-1" aria-hidden />
          <div className="mt-auto min-w-0 shrink-0 pt-1">{metaRow}</div>
        </div>
      </div>
    );
  }

  function renderDecks(
    deckList: Deck[],
    wrapper?: (deck: Deck, content: React.ReactNode) => React.ReactNode,
    menuCategoryId?: string | null
  ) {
    const groupedDeckLayout = viewMode === "grouped";
    if (deckLayout === "grid") {
      const gridClassName = groupedDeckLayout
        ? "grid w-full min-w-0 grid-cols-2 items-stretch gap-2 sm:grid-cols-2 sm:gap-2 md:gap-3 xl:grid-cols-3"
        : "grid w-full min-w-0 grid-cols-1 items-stretch gap-4 max-mobile:gap-3 sm:grid-cols-2 lg:grid-cols-3";
      return (
        <div className={gridClassName}>
          {deckList.map((deck) => (
            <div key={deck.id} className="h-full min-h-0 min-w-0 w-full">
              {wrapper
                ? wrapper(deck, renderDeckTile(deck, menuCategoryId))
                : renderDeckTile(deck, menuCategoryId)}
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className={groupedDeckLayout ? "flex flex-col gap-3" : "flex flex-col gap-4 max-mobile:gap-3"}>
        {deckList.map((deck) =>
          wrapper ? (
            <div key={deck.id}>{wrapper(deck, renderDeckRow(deck, menuCategoryId))}</div>
          ) : (
            <div key={deck.id} className="min-w-0 w-full">
              {renderDeckRow(deck, menuCategoryId)}
            </div>
          ),
        )}
      </div>
    );
  }

  return (
    <PageContainer className="max-mobile:space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <h1 className="text-2xl font-semibold tracking-tight max-mobile:text-xl min-w-0">
            My Decks
          </h1>
          <Link
            href="/create-deck"
            className="inline-flex w-full sm:w-auto shrink-0 items-center justify-center rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 max-mobile:min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            New Deck
          </Link>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2 text-sm border-b border-border/60 pb-3 -mt-1">
          <button
            type="button"
            onClick={() => {
              setCategoryModalOpen(true);
              setCategoryCreateError(null);
            }}
            className="text-left text-muted-foreground hover:text-foreground transition-colors w-fit text-sm"
          >
            + New category
          </button>
          {bulkPreviewLoading &&
          isPlatformAdmin &&
          sessionStatus === "authenticated" &&
          userId &&
          session?.backendUserId &&
          userId !== session.backendUserId ? (
            <span className="text-xs text-muted-foreground">Checking admin tools…</span>
          ) : null}
          {showBulkLegacyTransferAction ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs text-muted-foreground border-dashed w-fit"
              onClick={() => setBulkLegacyTransferModalOpen(true)}
            >
              Admin: move all decks to my account
            </Button>
          ) : null}
        </div>

        {categoryModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => { if (!categoryCreating) { setCategoryModalOpen(false); setCategoryCreateError(null); } }}
          >
            <div
              className="bg-background rounded-lg shadow-lg p-6 w-full max-w-sm mx-4"
              onClick={(e: MouseEvent) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-4">New Category</h2>
              <form onSubmit={handleCreateCategory} className="space-y-4">
                <Input
                  id="new-category-name"
                  name="categoryName"
                  placeholder="Category name"
                  value={categoryName}
                  onChange={(e) => { setCategoryName(e.target.value); setCategoryCreateError(null); }}
                  disabled={categoryCreating}
                  autoFocus
                  autoComplete="off"
                  className="w-full"
                />
                {categoryCreateError && (
                  <p className="text-sm text-destructive">{categoryCreateError}</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { if (!categoryCreating) { setCategoryModalOpen(false); setCategoryCreateError(null); } }}
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
              onClick={(e: MouseEvent) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-4">Rename Category</h2>
              <form onSubmit={handleRenameCategory} className="space-y-4">
                <Input
                  id="rename-category-name"
                  name="categoryName"
                  placeholder="Category name"
                  value={renameCategoryName}
                  onChange={(e) => { setRenameCategoryName(e.target.value); setRenameCategoryError(null); }}
                  disabled={renameSaving}
                  autoFocus
                  autoComplete="off"
                  className="w-full"
                />
                {renameCategoryError && (
                  <p className="text-sm text-destructive">{renameCategoryError}</p>
                )}
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
              onClick={(e: MouseEvent) => e.stopPropagation()}
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
              onClick={(e: MouseEvent) => e.stopPropagation()}
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
                    disabled={moveModalSaving || moveModalCreatingCat}
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
                {moveModalShowNewCatInput ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="New category name"
                        value={moveModalNewCatName}
                        onChange={(e) => {
                          setMoveModalNewCatName(e.target.value);
                          setMoveModalNewCatError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleMoveDeckCreateCategory();
                          }
                        }}
                        disabled={moveModalCreatingCat}
                        autoFocus
                        className="h-9 flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleMoveDeckCreateCategory()}
                        disabled={moveModalCreatingCat || !moveModalNewCatName.trim()}
                        className="h-9 px-3"
                      >
                        {moveModalCreatingCat ? "Adding…" : "Add"}
                      </Button>
                    </div>
                    {moveModalNewCatError && (
                      <p className="text-xs text-destructive">{moveModalNewCatError}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setMoveModalShowNewCatInput(false);
                        setMoveModalNewCatName("");
                        setMoveModalNewCatError(null);
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMoveModalShowNewCatInput(true)}
                    disabled={moveModalSaving}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="size-3.5" />
                    New category
                  </button>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeMoveModal}
                    disabled={moveModalSaving || moveModalCreatingCat}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={moveModalSaving || moveModalCreatingCat}
                  >
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
              onClick={(e: MouseEvent) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-4">Rename deck</h2>
              <form onSubmit={handleRenameDeck} className="space-y-4">
                <Input
                  id="rename-deck-name"
                  name="deckName"
                  placeholder="Deck name"
                  value={renameDeckName}
                  onChange={(e) => setRenameDeckName(e.target.value)}
                  disabled={renameDeckSaving}
                  autoFocus
                  autoComplete="off"
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
              onClick={(e: MouseEvent) => e.stopPropagation()}
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

        <div className="rounded-lg border border-border/70 bg-muted/10 p-2 sm:p-2.5 space-y-2">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search decks…"
              autoComplete="off"
              className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 max-mobile:py-2"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <div
                className="inline-flex shrink-0 items-stretch rounded-md border border-border/60 bg-background/80 p-0.5"
                role="tablist"
                aria-label="Deck grouping"
              >
                {(
                  [
                    { value: "grouped" as const, label: "By category" },
                    { value: "all" as const, label: "All decks" },
                  ] as const
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={viewMode === value}
                    onClick={() => setViewMode(value)}
                    className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                      viewMode === value
                        ? "bg-muted text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div
                className="inline-flex shrink-0 items-stretch rounded-md border border-border/60 bg-background/80 p-0.5"
                role="tablist"
                aria-label="List or grid layout"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={deckLayout === "list"}
                  onClick={() => switchDeckLayout("list")}
                  className={`inline-flex items-center justify-center rounded p-1.5 sm:p-2 ${
                    deckLayout === "list"
                      ? "bg-muted text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-label="List view"
                >
                  <List className="size-4 shrink-0" />
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={deckLayout === "grid"}
                  onClick={() => switchDeckLayout("grid")}
                  className={`inline-flex items-center justify-center rounded p-1.5 sm:p-2 ${
                    deckLayout === "grid"
                      ? "bg-muted text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-label="Grid view"
                >
                  <LayoutGrid className="size-4 shrink-0" />
                </button>
              </div>
            </div>
            <div className="relative shrink-0 sm:ml-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-2 text-xs sm:text-sm"
                aria-expanded={filtersMenuOpen}
                aria-haspopup="dialog"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setFiltersMenuOpen((o) => !o);
                }}
              >
                <SlidersHorizontal className="size-3.5 shrink-0" />
                Sort & display
              </Button>
              {filtersMenuOpen && (
                <div
                  className="absolute right-0 top-full z-50 mt-1 w-[min(100vw-2rem,17rem)] rounded-lg border border-border bg-popover p-3 shadow-lg space-y-3"
                  onClick={(e: MouseEvent) => e.stopPropagation()}
                >
                  {viewMode === "all" && (
                    <div className="space-y-1">
                      <label htmlFor="deck-sort-options" className="text-xs font-medium text-muted-foreground">
                        Sort
                      </label>
                      <select
                        id="deck-sort-options"
                        value={sortMode}
                        onChange={(e) => setSortMode(e.target.value as "newest" | "oldest" | "az")}
                        className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
                      >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                        <option value="az">Name A–Z</option>
                      </select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Study status</p>
                    <div
                      className="flex w-full min-w-0 max-w-full flex-nowrap items-stretch justify-between gap-0.5 rounded-lg border border-border/80 bg-muted/25 p-0.5"
                      role="group"
                      aria-label="Filter decks by study status"
                    >
                      <button
                        type="button"
                        title="All statuses"
                        aria-pressed={studyStatusFilter === "all"}
                        onClick={() => setStudyStatusFilter("all")}
                        className={cn(
                          "inline-flex h-9 min-w-0 flex-1 shrink items-center justify-center rounded-md border text-foreground/90 touch-manipulation transition-colors",
                          studyStatusFilter === "all"
                            ? "border-border bg-background shadow-sm"
                            : "border-transparent bg-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground"
                        )}
                      >
                        <List className="size-4" aria-hidden />
                        <span className="sr-only">All</span>
                      </button>
                      {DECK_STUDY_STATUSES.map((s) => {
                        const active = studyStatusFilter === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            title={DECK_STUDY_STATUS_LABELS[s]}
                            aria-pressed={active}
                            aria-label={DECK_STUDY_STATUS_LABELS[s]}
                            onClick={() => setStudyStatusFilter(s)}
                            className={cn(
                              "inline-flex h-9 min-w-0 flex-1 shrink items-center justify-center rounded-md border touch-manipulation transition-colors",
                              active
                                ? deckStudyStatusTriggerClass(s)
                                : "border-transparent bg-transparent text-muted-foreground hover:bg-background/50 hover:text-foreground"
                            )}
                          >
                            <StudyStatusIcon status={s} className="size-4" />
                            <span className="sr-only">{DECK_STUDY_STATUS_LABELS[s]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showArchived}
                      onChange={(e) => setShowArchived(e.target.checked)}
                      className="rounded border-input size-4 shrink-0"
                    />
                    Show archived decks
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDeckDates}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setShowDeckDates(v);
                        try {
                          localStorage.setItem(SHOW_DECK_DATES_STORAGE_KEY, v ? "1" : "0");
                        } catch {
                          /* ignore */
                        }
                      }}
                      className="rounded border-input size-4 shrink-0"
                    />
                    Show created dates on cards
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2 sm:space-y-3">
          {showDeckListSkeleton ? (
            <DeckListSkeleton rows={5} />
          ) : decksError ? (
            <div className="text-center py-8 sm:py-12">
              <p className="font-medium mb-1">Unable to load decks</p>
              <p className="text-sm text-muted-foreground">
                The API may be unavailable. Please refresh the page.
              </p>
            </div>
          ) : decks.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <p className="text-muted-foreground mb-4">
                {showArchived
                  ? "No archived decks."
                  : "No decks yet."}
              </p>
              {!showArchived && (
                <Link
                  href="/create-deck"
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-4 text-sm font-medium"
                >
                  Create your first deck
                </Link>
              )}
            </div>
          ) : filteredDecks.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <p className="text-muted-foreground">
                {searchQuery.trim()
                  ? `No decks match "${searchQuery.trim()}".`
                  : studyStatusFilter !== "all"
                    ? `No decks with status "${DECK_STUDY_STATUS_LABELS[studyStatusFilter]}".`
                    : "No decks match your filters."}
              </p>
            </div>
          ) : viewMode === "all" ? (
            renderDecks(sortedFlatDecks)
          ) : (
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              {groupDecksByCategory(filteredDecks, categories)
                .filter((group) => group.decks.length > 0 || !searchQuery.trim())
                .map((group, idx) => {
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
                    className={`group ${idx === 0 ? "mt-0" : "mt-4 sm:mt-6"}`}
                  >
                    <div className="flex items-center gap-1 min-h-[36px] sm:min-h-[40px] mb-0 max-mobile:gap-0.5">
                      <button
                        type="button"
                        onClick={() => toggleCollapsed(group.categoryId)}
                        className="p-1 -ml-1 rounded-md hover:bg-muted transition-colors shrink-0 touch-manipulation"
                        aria-label={collapsedCategories.has(group.categoryId) ? "Expand category" : "Collapse category"}
                      >
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${
                            collapsedCategories.has(group.categoryId) ? "-rotate-90" : ""
                          }`}
                        />
                      </button>
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                        {group.categoryId !== UNCATEGORIZED ? (
                          <Link
                            href={`/categories/${group.categoryId}`}
                            className="text-sm sm:text-base font-semibold text-foreground hover:text-foreground/70 transition-colors truncate"
                          >
                            {group.categoryName}
                          </Link>
                        ) : (
                          <span className="text-sm sm:text-base font-semibold text-foreground truncate">
                            {group.categoryName}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {group.decks.length}
                        </span>
                      </div>
                      {group.categoryId !== UNCATEGORIZED && (
                        <div className="relative shrink-0 opacity-80 hover:opacity-100 transition-opacity">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            aria-label="Category actions"
                            aria-expanded={openCategoryActionsId === group.categoryId}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setOpenCategoryActionsId((prev) =>
                                prev === group.categoryId ? null : group.categoryId
                              );
                            }}
                          >
                            <MoreVertical className="size-4" />
                          </Button>
                          {openCategoryActionsId === group.categoryId && (
                            <div
                              className="absolute right-0 top-full z-50 mt-0.5 w-max min-w-[15rem] max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-popover py-1 shadow-lg"
                              onClick={(e: MouseEvent) => e.stopPropagation()}
                              role="menu"
                            >
                              {group.decks.length > 0 && (
                                <>
                                  <Link
                                    href={`/explore/category/${group.categoryId}`}
                                    role="menuitem"
                                    className="flex w-full items-center justify-start gap-2.5 whitespace-nowrap px-3 py-2.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[44px]"
                                    onClick={() => setOpenCategoryActionsId(null)}
                                  >
                                    <Eye className="size-4 shrink-0" aria-hidden />
                                    <span>Explore category</span>
                                  </Link>
                                  <Link
                                    href={`/study/category/${group.categoryId}`}
                                    role="menuitem"
                                    className="flex w-full items-center justify-start gap-2.5 whitespace-nowrap px-3 py-2.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[44px]"
                                    onClick={() => setOpenCategoryActionsId(null)}
                                  >
                                    <BookOpen className="size-4 shrink-0" aria-hidden />
                                    <span>Quiz category</span>
                                  </Link>
                                </>
                              )}
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center justify-start gap-2.5 whitespace-nowrap px-3 py-2.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[44px]"
                                onClick={() => {
                                  setOpenCategoryActionsId(null);
                                  openRenameModal(group.categoryId, group.categoryName);
                                }}
                              >
                                <Pencil className="size-4 shrink-0" aria-hidden />
                                <span>Rename category</span>
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center justify-start gap-2.5 whitespace-nowrap px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[44px]"
                                onClick={() => {
                                  setOpenCategoryActionsId(null);
                                  setDeleteConfirmId(group.categoryId);
                                }}
                              >
                                <Trash2 className="size-4 shrink-0" aria-hidden />
                                <span>Delete category</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {!collapsedCategories.has(group.categoryId) && (
                    <div className="pl-5 sm:pl-6 max-mobile:pl-2">
                      {renderDecks(
                        group.decks,
                        (deck, content) => (
                        <DraggableDeckRow
                          key={deck.id}
                          deck={deck}
                          isDragging={activeDragId === deck.id}
                          className={deckLayout === "grid" ? "h-full min-h-0" : undefined}
                        >
                          {content}
                        </DraggableDeckRow>
                        ),
                        group.categoryId === UNCATEGORIZED ? null : group.categoryId
                      )}
                    </div>
                  )}
                </DroppableCategory>
              );
              })}
            </DndContext>
          )}
        </div>

        <AdminTransferDeckConfirmModal
          open={adminTransferTarget !== null}
          onOpenChange={(open) => {
            if (!open) setAdminTransferTarget(null);
          }}
          deck={
            adminTransferTarget
              ? {
                  id: adminTransferTarget.id,
                  owner_name: adminTransferTarget.owner_name,
                  owner_email: adminTransferTarget.owner_email,
                }
              : null
          }
          onTransferred={(data) => {
            const id = (data as { id: string }).id;
            setDecks((d) => d.filter((x) => x.id !== id));
            setRefreshKey((k) => k + 1);
            router.refresh();
          }}
        />

        <AdminBulkLegacyTransferConfirmModal
          open={bulkLegacyTransferModalOpen}
          onOpenChange={setBulkLegacyTransferModalOpen}
          sourceUserId={
            bulkLegacyTransferModalOpen && bulkPreview?.is_legacy_user && userId ? userId : null
          }
          ownerName={bulkPreview?.name ?? ""}
          ownerEmail={bulkPreview?.email ?? ""}
          deckCount={bulkPreview?.deck_count ?? 0}
          onTransferred={() => {
            setDecks([]);
            setRefreshKey((k) => k + 1);
            router.refresh();
          }}
        />

        {moveFeedbackText ? (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed bottom-6 left-1/2 z-50 max-w-[min(90vw,22rem)] -translate-x-1/2 rounded-lg border border-border/70 bg-background/95 px-3.5 py-2 text-sm text-foreground shadow-lg backdrop-blur-sm supports-[backdrop-filter]:bg-background/80"
          >
            <div className="flex items-center gap-2.5">
              <Check
                className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                strokeWidth={2.5}
                aria-hidden
              />
              <span className="leading-tight">{moveFeedbackText}</span>
            </div>
          </div>
        ) : null}
    </PageContainer>
  );
}