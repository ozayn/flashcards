"use client";

import { useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  ChevronRight,
  ChevronUp,
  Download,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  MoreHorizontal,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCategory,
  deleteDeck,
  deleteFlashcard,
  duplicateDeck,
  formatYoutubeDuration,
  generateFlashcards,
  getCategories,
  getDeck,
  getFlashcards,
  getRelatedDecks,
  importFlashcards,
  moveDeckToCategory,
  parseQAPairs,
  parseYoutubeDeckSourceMetadata,
  updateDeck,
} from "@/lib/api";
import { getStoredUserId, useCardCountOptions } from "@/components/user-selector";
import { GENERATION_TEXT_MAX_CHARS } from "@/lib/generation-text";
import {
  peekDeckBackgroundGenerationPending,
  clearDeckBackgroundGenerationPending,
} from "@/lib/deck-pending-generation";
import { formatDeckCreatedCalendarDate } from "@/lib/format-deck-date";
import PageContainer from "@/components/layout/page-container";
import FormattedText from "@/components/FormattedText";
import { FlashcardModal } from "@/components/FlashcardModal";
import { DeckGenerationBadge, isDeckGeneratingLike } from "@/components/DeckGenerationBadge";
import { AdminTransferDeckConfirmModal } from "@/components/AdminTransferDeckConfirmModal";

interface DeckPageProps {
  params: { id: string };
}

interface Deck {
  id: string;
  name: string;
  description: string | null;
  source_type?: string | null;
  source_topic?: string | null;
  source_url?: string | null;
  /** JSON: { duration_seconds?, caption_language? } for YouTube */
  source_metadata?: string | null;
  has_timestamps?: boolean;
  generation_status?: string;
  archived?: boolean;
  is_public?: boolean;
  category_id?: string | null;
  user_id?: string;
  created_at?: string | null;
  owner_is_legacy?: boolean;
  owner_name?: string | null;
  owner_email?: string | null;
}

interface Category {
  id: string;
  name: string;
}

interface RelatedDeck {
  id: string;
  name: string;
  card_count: number;
}

interface Flashcard {
  id: string;
  question: string;
  answer_short: string;
  answer_detailed?: string | null;
}

const UNCATEGORIZED = "__uncategorized__";

function slugFromTitle(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "deck"
  );
}

const CARD_DIVIDER = "--------------------------------------------------";

/** In-panel copy for Add more cards while a request is in flight (topic / text / import). */
function addCardsBusyCopy(mode: "topic" | "text" | "import"): {
  primary: string;
  secondary?: string;
} {
  switch (mode) {
    case "text":
      return { primary: "Generating…", secondary: "May take a minute." };
    case "topic":
      return { primary: "Generating…", secondary: "May take a minute." };
    case "import":
      return { primary: "Importing…" };
  }
}

/** Collapse runs of blank lines; trim ends */
function collapseBlankLines(s: string): string {
  return s
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Strip leading "What is a/an X?" → "X" when the pattern is a simple definitional question.
 * Keeps the original question if it looks like "What is the …" or other non-obvious forms.
 */
function cleanupExportTitle(question: string): string {
  const q = question.trim();
  if (!q) return q;

  let m = /^what\s+is\s+a\s+(.+?)\?*\s*$/i.exec(q);
  if (m) return m[1].trim();

  m = /^what\s+is\s+an\s+(.+?)\?*\s*$/i.exec(q);
  if (m) return m[1].trim();

  m = /^what\s+is\s+(.+?)\?*\s*$/i.exec(q);
  if (m) {
    const inner = m[1].trim();
    if (!/^the\b/i.test(inner)) return inner;
  }

  return q;
}

/** Split answer_short into Definition / Example blocks when labels are present */
function parseAnswerForExport(answer: string): {
  definition: string | null;
  example: string | null;
  plain: string | null;
} {
  const raw = answer.replace(/\r\n/g, "\n").trim();
  if (!raw) return { definition: null, example: null, plain: null };

  const exRe = /(?:^|\n)\s*example:\s*/i;
  const exMatch = exRe.exec(raw);
  let beforeExample = raw;
  let exampleBody: string | null = null;
  if (exMatch && exMatch.index !== undefined) {
    beforeExample = raw.slice(0, exMatch.index).trim();
    exampleBody = raw.slice(exMatch.index + exMatch[0].length).trim();
  }

  const defLabel = beforeExample.match(/^\s*definition:\s*([\s\S]*)/i);
  if (defLabel) {
    return {
      definition: collapseBlankLines(defLabel[1]),
      example: exampleBody ? collapseBlankLines(exampleBody) : null,
      plain: null,
    };
  }

  if (exampleBody !== null) {
    return {
      definition: beforeExample ? collapseBlankLines(beforeExample) : null,
      example: collapseBlankLines(exampleBody),
      plain: null,
    };
  }

  return { definition: null, example: null, plain: collapseBlankLines(raw) };
}

const _SOURCE_TYPE_LABELS: Record<string, string> = {
  youtube: "YouTube",
  wikipedia: "Wikipedia",
  url: "URL",
  webpage: "URL",
  topic: "Topic",
  text: "Text",
  pdf: "PDF",
  manual: "Manual",
};

function exportDeckAsTxt(
  deck: Deck,
  categoryName: string | null,
  cards: Flashcard[]
): void {
  const lines: string[] = [
    (deck.name || "").trim().toUpperCase(),
  ];

  if (categoryName) {
    lines.push(`Category: ${categoryName}`);
  }

  const sourceLabel = deck.source_type ? _SOURCE_TYPE_LABELS[deck.source_type] || deck.source_type : null;
  if (sourceLabel) {
    lines.push(`Source: ${sourceLabel}`);
  }
  if (deck.source_url) {
    lines.push(`Source URL: ${deck.source_url}`);
  }
  if (deck.source_topic?.trim() && deck.source_topic.trim() !== deck.name?.trim()) {
    lines.push(`Topic: ${deck.source_topic.trim()}`);
  }

  lines.push(`Cards: ${cards.length}`);
  lines.push("");

  if (cards.length === 0) {
    lines.push("No cards available.");
  } else {
    cards.forEach((card, i) => {
      const q = (card.question || "").trim();
      const title = cleanupExportTitle(q);
      const lineTitle = `${i + 1}. ${title}`;

      const shortTrim = (card.answer_short || "").trim();
      const detailedTrim = (card.answer_detailed || "").trim();
      const { definition, example, plain } = parseAnswerForExport(
        card.answer_short || ""
      );

      lines.push(CARD_DIVIDER);
      lines.push(lineTitle);
      lines.push("");

      if (plain) {
        lines.push(plain);
      } else {
        if (definition) {
          lines.push("Definition:");
          lines.push(definition);
        }
        if (example) {
          lines.push("");
          lines.push("Example:");
          lines.push(example);
        }
        if (!definition && !example) {
          lines.push(shortTrim || "(empty answer)");
        }
      }

      if (detailedTrim && detailedTrim !== shortTrim) {
        lines.push("");
        lines.push("More detail:");
        lines.push(collapseBlankLines(detailedTrim));
      }
    });
    lines.push(CARD_DIVIDER);
  }

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugFromTitle(deck.name || "deck")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DeckPage({ params }: DeckPageProps) {
  const router = useRouter();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [relatedDecks, setRelatedDecks] = useState<RelatedDeck[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryModalSelectedId, setCategoryModalSelectedId] = useState<string>(UNCATEGORIZED);
  const [categorySaving, setCategorySaving] = useState(false);
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatError, setNewCatError] = useState<string | null>(null);
  const [creatingCat, setCreatingCat] = useState(false);
  const [loading, setLoading] = useState(true);
  /** True while initial fetch runs after create-deck background generation navigation. */
  const [pendingGenBootstrap, setPendingGenBootstrap] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [title, setTitle] = useState(deck?.name ?? "");
  const [description, setDescription] = useState(deck?.description ?? "");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [gridMenuOpenId, setGridMenuOpenId] = useState<string | null>(null);
  const [deckDeleteConfirm, setDeckDeleteConfirm] = useState(false);
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false);
  const [modalCardIndex, setModalCardIndex] = useState<number | null>(null);
  const [genTopic, setGenTopic] = useState("");
  const [genText, setGenText] = useState("");
  const [genMode, setGenMode] = useState<"topic" | "text" | "import">("topic");
  const [importText, setImportText] = useState("");
  const [importFiles, setImportFiles] = useState<{ name: string; pairCount: number; error?: string }[]>([]);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const genTextFileInputRef = useRef<HTMLInputElement>(null);
  const [genTextUploadStatus, setGenTextUploadStatus] = useState<string | null>(null);
  const [useNameAsTopic, setUseNameAsTopic] = useState(false);
  const [cardCount, setCardCount] = useState(10);
  const cardCountOptions = useCardCountOptions();
  const { data: session, status: sessionStatus } = useSession();
  const isPlatformAdmin = Boolean(session?.isPlatformAdmin);
  const [cardView, setCardView] = useState<"list" | "grid">("grid");
  const [cardsExpanded, setCardsExpanded] = useState(false);
  const [cardSearch, setCardSearch] = useState("");
  const [cardSort, setCardSort] = useState<"newest" | "oldest" | "az">("newest");

  type SortOption = typeof cardSort;
  const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: "newest", label: "Newest" },
    { value: "oldest", label: "Oldest" },
    { value: "az", label: "A–Z" },
  ];

  const currentUserId = getStoredUserId();
  const isReadOnly = Boolean(deck?.is_public && deck?.user_id && deck.user_id !== currentUserId);
  const canOfferAdminTransfer =
    sessionStatus === "authenticated" &&
    isPlatformAdmin &&
    Boolean(deck?.owner_is_legacy) &&
    Boolean(session?.backendUserId) &&
    deck?.user_id !== session.backendUserId;
  const [duplicating, setDuplicating] = useState(false);

  const processedCards = useMemo(() => {
    let cards = [...flashcards];
    const q = cardSearch.trim().toLowerCase();
    if (q) {
      cards = cards.filter(
        (c) =>
          c.question.toLowerCase().includes(q) ||
          c.answer_short.toLowerCase().includes(q)
      );
    }
    if (cardSort === "oldest") {
      cards.reverse();
    } else if (cardSort === "az") {
      cards.sort((a, b) => a.question.localeCompare(b.question));
    }
    return cards;
  }, [flashcards, cardSearch, cardSort]);

  const PREVIEW_LIMIT_LIST = 12;
  const PREVIEW_LIMIT_GRID = 9;
  const previewLimit = cardView === "list" ? PREVIEW_LIMIT_LIST : PREVIEW_LIMIT_GRID;
  const isSearching = cardSearch.trim().length > 0;
  const hasOverflow = !isSearching && processedCards.length > previewLimit;
  const visibleCards = cardsExpanded || !hasOverflow ? processedCards : processedCards.slice(0, previewLimit);

  const hasFlashcards = flashcards.length > 0;
  const [genPanelExpanded, setGenPanelExpanded] = useState(true);
  const prevFlashcardCountRef = useRef(-1);

  useEffect(() => {
    const n = flashcards.length;
    const prev = prevFlashcardCountRef.current;
    if (n > 0 && (prev === 0 || prev === -1)) {
      setGenPanelExpanded(false);
    }
    if (n === 0 && prev !== -1) {
      setGenPanelExpanded(true);
    }
    prevFlashcardCountRef.current = n;
  }, [flashcards.length]);

  useEffect(() => {
    setGridMenuOpenId(null);
  }, [cardView]);

  useLayoutEffect(() => {
    setPendingGenBootstrap(peekDeckBackgroundGenerationPending(params.id));
  }, [params.id]);

  useEffect(() => {
    if (!loading && pendingGenBootstrap) {
      clearDeckBackgroundGenerationPending(params.id);
      setPendingGenBootstrap(false);
    }
  }, [loading, pendingGenBootstrap, params.id]);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const [deckData, flashcardsData] = await Promise.all([
          getDeck(params.id),
          getFlashcards(params.id),
        ]);
        if (!cancelled) {
          setDeck(deckData);
          setFlashcards(Array.isArray(flashcardsData) ? flashcardsData : []);
        }
        if (!cancelled && deckData?.category_id) {
          try {
            const related = await getRelatedDecks(params.id);
            if (!cancelled) setRelatedDecks(Array.isArray(related) ? related : []);
          } catch {
            if (!cancelled) setRelatedDecks([]);
          }
        } else if (!cancelled) {
          setRelatedDecks([]);
        }
        if (!cancelled && deckData?.user_id) {
          try {
            const cats = await getCategories(deckData.user_id);
            if (!cancelled) setCategories(Array.isArray(cats) ? cats : []);
          } catch {
            if (!cancelled) setCategories([]);
          }
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [params.id]);

  const deckGenerating = isDeckGeneratingLike(deck?.generation_status);
  const isFailed = deck?.generation_status === "failed";

  useEffect(() => {
    if (!deckGenerating) return;
    const interval = setInterval(async () => {
      try {
        const [deckData, flashcardsData] = await Promise.all([
          getDeck(params.id),
          getFlashcards(params.id),
        ]);
        setDeck(deckData);
        setFlashcards(Array.isArray(flashcardsData) ? flashcardsData : []);
      } catch { /* ignore polling errors */ }
    }, 4000);
    return () => clearInterval(interval);
  }, [deckGenerating, params.id]);

  useEffect(() => {
    if (deck) {
      setTitle(deck.name ?? "");
      setDescription(deck.description ?? "");
    }
  }, [deck]);

  useEffect(() => {
    if (genMode !== "text") setGenTextUploadStatus(null);
  }, [genMode]);

  useEffect(() => {
    setCardCount((c) => {
      const max = cardCountOptions[cardCountOptions.length - 1];
      if (max === undefined) return c;
      return c > max ? max : c;
    });
  }, [cardCountOptions]);

  const importQAPairs = genMode === "import" ? parseQAPairs(importText.trim()) : null;

  const generationPanelBusy = useMemo(
    () => (generating ? addCardsBusyCopy(genMode) : null),
    [generating, genMode],
  );

  function handleGenTextFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = "";
    setGenTextUploadStatus(null);
    if (!file) return;

    const nameLower = file.name.toLowerCase();
    if (!nameLower.endsWith(".txt")) {
      setGenTextUploadStatus("Only .txt files are supported.");
      return;
    }
    const mimeOk =
      file.type === "text/plain" ||
      file.type === "" ||
      file.type === "application/octet-stream";
    if (!mimeOk) {
      setGenTextUploadStatus("That file type is not supported. Please use a plain .txt file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      if (raw.length > GENERATION_TEXT_MAX_CHARS) {
        setGenText(raw.slice(0, GENERATION_TEXT_MAX_CHARS));
        setGenTextUploadStatus(
          `Loaded ${file.name} — trimmed to ${GENERATION_TEXT_MAX_CHARS.toLocaleString()} characters (limit).`,
        );
      } else {
        setGenText(raw);
        setGenTextUploadStatus(`Loaded ${file.name}.`);
      }
    };
    reader.onerror = () => {
      setGenTextUploadStatus("Could not read the file.");
    };
    reader.readAsText(file);
  }

  async function handleGenerate() {
    if (!deck || generating) return;
    const topicTrimmed = genTopic.trim();
    const textTrimmed = genText.trim();
    const effectiveTopic =
      topicTrimmed || (useNameAsTopic && !topicTrimmed ? title.trim() : "");
    if (genMode === "topic" && !effectiveTopic) return;
    if (genMode === "text" && !textTrimmed) return;
    setGenerating(true);
    setImportResult(null);
    try {
      if (genMode === "text") {
        await generateFlashcards({ deck_id: deck.id, text: textTrimmed, num_cards: cardCount, language: "en" });
      } else {
        await generateFlashcards({ deck_id: deck.id, topic: effectiveTopic, num_cards: cardCount, language: "en" });
      }
      setGenTopic("");
      setGenText("");
      setGenTextUploadStatus(null);
      const data = await getFlashcards(params.id);
      setFlashcards(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  }

  async function handleImport() {
    if (!deck || generating || !importQAPairs || importQAPairs.length === 0) return;
    setGenerating(true);
    setImportResult(null);
    setImportError(null);
    try {
      const result = await importFlashcards({ deck_id: deck.id, cards: importQAPairs });
      setImportResult(result);
      setImportText("");
      setImportFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      const data = await getFlashcards(params.id);
      setFlashcards(Array.isArray(data) ? data : []);
    } catch {
      setImportError("Failed to import cards. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImportResult(null);
    setImportError(null);

    const fileArray = Array.from(files);
    const tooBig = fileArray.filter((f) => f.size > 500_000);
    const badType = fileArray.filter(
      (f) => !f.name.endsWith(".txt") && f.type !== "text/plain"
    );
    if (badType.length > 0) {
      setImportError(`Only .txt files are supported. Skipped: ${badType.map((f) => f.name).join(", ")}`);
    }
    if (tooBig.length > 0) {
      setImportError(`File too large (max 500 KB each): ${tooBig.map((f) => f.name).join(", ")}`);
    }

    const validFiles = fileArray.filter(
      (f) =>
        f.size <= 500_000 &&
        (f.name.endsWith(".txt") || f.type === "text/plain")
    );
    if (validFiles.length === 0) return;

    const allTexts: string[] = [];
    const fileSummaries: { name: string; pairCount: number; error?: string }[] = [];
    let loaded = 0;

    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const pairs = parseQAPairs(text.trim());
        if (pairs && pairs.length > 0) {
          allTexts.push(text);
          fileSummaries.push({ name: file.name, pairCount: pairs.length });
        } else {
          fileSummaries.push({ name: file.name, pairCount: 0, error: "No valid Q:/A: pairs" });
        }
        loaded++;
        if (loaded === validFiles.length) {
          const combined = allTexts.join("\n\n");
          setImportText(combined);
          setImportFiles(fileSummaries);
          if (allTexts.length === 0) {
            setImportError("No valid Q:/A: pairs found in any of the uploaded files.");
          }
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
      reader.readAsText(file);
    });
  }

  async function handleDeleteCard(cardId: string) {
    try {
      await deleteFlashcard(cardId);
      const data = await getFlashcards(params.id);
      setFlashcards(Array.isArray(data) ? data : []);
      setDeleteConfirmId(null);
    } catch {
      // ignore
    }
  }

  async function handleMoveCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!deck || categorySaving) return;
    const categoryId = categoryModalSelectedId === UNCATEGORIZED ? null : categoryModalSelectedId;
    if (categoryId === (deck.category_id ?? null)) {
      setCategoryModalOpen(false);
      return;
    }
    setCategorySaving(true);
    try {
      await moveDeckToCategory(deck.id, categoryId);
      const [deckData, related] = await Promise.all([
        getDeck(params.id),
        categoryId ? getRelatedDecks(params.id) : Promise.resolve([]),
      ]);
      setDeck(deckData);
      setRelatedDecks(Array.isArray(related) ? related : []);
      setCategoryModalOpen(false);
    } catch {
      // ignore
    } finally {
      setCategorySaving(false);
    }
  }

  async function handleCreateCategory() {
    if (!deck || creatingCat) return;
    const trimmed = newCatName.trim();
    if (!trimmed) {
      setNewCatError("Category name cannot be empty.");
      return;
    }
    const duplicate = categories.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setCategoryModalSelectedId(duplicate.id);
      setShowNewCatInput(false);
      setNewCatName("");
      setNewCatError(null);
      return;
    }
    setCreatingCat(true);
    setNewCatError(null);
    try {
      const created = await createCategory({ name: trimmed, user_id: deck.user_id! });
      const catId = (created as { id: string }).id;
      if (deck.user_id) {
        const cats = await getCategories(deck.user_id);
        setCategories(Array.isArray(cats) ? cats : []);
      }
      setCategoryModalSelectedId(catId);
      setShowNewCatInput(false);
      setNewCatName("");
    } catch (err) {
      setNewCatError(err instanceof Error ? err.message : "Failed to create category.");
    } finally {
      setCreatingCat(false);
    }
  }

  async function handleDeleteDeck() {
    if (!deck) return;
    try {
      await deleteDeck(deck.id);
      router.push("/decks");
    } catch {
      // ignore
    } finally {
      setDeckDeleteConfirm(false);
    }
  }

  async function handleDuplicate() {
    if (!deck || duplicating) return;
    const userId = getStoredUserId();
    if (!userId) return;
    setDuplicating(true);
    try {
      const copy = await duplicateDeck(deck.id, userId);
      router.push(`/decks/${(copy as { id: string }).id}`);
    } catch {
      setDuplicating(false);
    }
  }

  if (loading) {
    if (pendingGenBootstrap) {
      return (
        <PageContainer>
          <Link
            href="/decks"
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted w-fit"
          >
            ← Back
          </Link>

          <div className="mt-6 max-w-md space-y-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Deck created</h1>
              <p className="text-sm text-muted-foreground mt-1.5">Generating cards for this deck.</p>
              <p className="text-xs text-muted-foreground/90 mt-1">You can leave and come back later.</p>
            </div>

            <div
              className="h-1 w-full max-w-sm overflow-hidden rounded-full bg-blue-200/70 dark:bg-blue-900/50"
              role="progressbar"
              aria-label="Generating"
              aria-busy="true"
            >
              <div className="h-full w-[38%] rounded-full bg-blue-500/55 dark:bg-blue-400/45 deck-load-indeterminate-fill" />
            </div>

            <Link
              href="/decks"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-4 text-sm font-medium"
            >
              My Decks
            </Link>

            <div className="pt-4 space-y-2.5" aria-hidden>
              <div className="rounded-lg border border-border/50 bg-muted/15 dark:bg-muted/10 px-3 py-3 space-y-2">
                <div className="h-3.5 w-[90%] rounded bg-muted/70 animate-pulse" />
                <div className="h-3.5 w-[45%] rounded bg-muted/50 animate-pulse" />
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/15 dark:bg-muted/10 px-3 py-3 space-y-2">
                <div className="h-3.5 w-[78%] rounded bg-muted/60 animate-pulse" />
                <div className="h-3.5 w-[55%] rounded bg-muted/45 animate-pulse" />
              </div>
            </div>
          </div>
        </PageContainer>
      );
    }

    return (
      <PageContainer>
        <div className="flex items-center justify-between gap-3">
          <div className="h-7 w-20 max-w-[30%] rounded-md bg-muted/80 animate-pulse" aria-hidden />
          <div className="h-9 w-9 shrink-0 rounded-md bg-muted/80 animate-pulse" aria-hidden />
        </div>

        <Card className="mt-4">
          <div className="px-4 pt-4 pb-5 space-y-5">
            <div className="space-y-2 max-w-sm">
              <p className="text-sm text-muted-foreground">Loading deck…</p>
              <div
                className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-muted/90 dark:bg-muted/50"
                role="progressbar"
                aria-label="Loading"
                aria-busy="true"
              >
                <div className="h-full w-[38%] rounded-full bg-primary/35 deck-load-indeterminate-fill" />
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <div className="h-8 w-[min(100%,20rem)] rounded-md bg-muted animate-pulse" aria-hidden />
              <div className="h-4 w-48 max-w-[70%] rounded-md bg-muted/70 animate-pulse" aria-hidden />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <div className="h-10 w-[5.5rem] rounded-lg bg-muted/80 animate-pulse" aria-hidden />
              <div className="h-10 w-[5.5rem] rounded-lg bg-muted/80 animate-pulse" aria-hidden />
            </div>

            <div className="space-y-3 pt-2">
              <div className="rounded-xl border border-border/60 bg-muted/20 dark:bg-muted/10 px-4 py-3.5 space-y-2">
                <div className="h-4 w-[88%] rounded bg-muted/90 animate-pulse" aria-hidden />
                <div className="h-4 w-[55%] rounded bg-muted/60 animate-pulse" aria-hidden />
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 dark:bg-muted/10 px-4 py-3.5 space-y-2">
                <div className="h-4 w-[92%] rounded bg-muted/90 animate-pulse" aria-hidden />
                <div className="h-4 w-[40%] rounded bg-muted/60 animate-pulse" aria-hidden />
              </div>
            </div>
          </div>
        </Card>
      </PageContainer>
    );
  }

  if (notFound || !deck) {
    return (
      <PageContainer>
          <Link
            href="/decks"
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
          >
            ← Back
          </Link>
          <p className="text-muted-foreground">Deck not found.</p>
      </PageContainer>
    );
  }

  const deckDateShort = formatDeckCreatedCalendarDate(deck.created_at);

  return (
    <PageContainer>
        <div className="flex items-center justify-between">
          <Link
            href={isReadOnly ? "/library" : "/decks"}
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
          >
            ← Back
          </Link>
          {!isReadOnly && <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              try {
                await updateDeck(deck.id, { archived: !deck.archived });
                router.push("/decks");
              } catch {
                // ignore
              }
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label={deck.archived ? "Unarchive deck" : "Archive deck"}
          >
            {deck.archived ? (
              <ArchiveRestore className="size-4" />
            ) : (
              <Archive className="size-4" />
            )}
          </Button>}
        </div>

        <Card>
          <div className="px-4 pt-4 pb-4">
            <div className="flex flex-col gap-2 mb-4">
              {editingTitle && !isReadOnly ? (
                <input
                  id="deck-title"
                  name="deckTitle"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={async () => {
                    if (deck) {
                      try {
                        await updateDeck(deck.id, { name: title });
                        const data = await getDeck(params.id);
                        setDeck(data);
                      } catch {
                        // ignore
                      }
                    }
                    setEditingTitle(false);
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && deck) {
                      try {
                        await updateDeck(deck.id, { name: title });
                        const data = await getDeck(params.id);
                        setDeck(data);
                      } catch {
                        // ignore
                      }
                      setEditingTitle(false);
                    }
                  }}
                  className="text-2xl font-semibold border rounded px-2 py-1 w-full"
                  autoFocus
                />
              ) : (
                <div className="flex flex-wrap items-center gap-2 gap-y-1">
                  <h1
                    className={`text-2xl font-semibold ${isReadOnly ? "" : "cursor-pointer"}`}
                    onClick={() => !isReadOnly && setEditingTitle(true)}
                  >
                    {title}
                  </h1>
                  <DeckGenerationBadge status={deck.generation_status} />
                </div>
              )}
              {editingDescription && !isReadOnly ? (
                <textarea
                  id="deck-description"
                  name="deckDescription"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={async () => {
                    if (deck) {
                      try {
                        await updateDeck(deck.id, { description });
                        const data = await getDeck(params.id);
                        setDeck(data);
                      } catch {
                        // ignore
                      }
                    }
                    setEditingDescription(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setEditingDescription(false);
                    }
                  }}
                  className="border rounded px-2 py-1 w-full min-h-[60px] text-sm text-muted-foreground mt-1"
                  autoFocus
                />
              ) : description ? (
                <p
                  className={`text-sm text-muted-foreground mt-1 line-clamp-2 ${isReadOnly ? "" : "cursor-pointer hover:text-foreground"}`}
                  onClick={() => !isReadOnly && setEditingDescription(true)}
                  title={description}
                >
                  {description}
                </p>
              ) : !isReadOnly ? (
                <button
                  type="button"
                  onClick={() => setEditingDescription(true)}
                  className="text-xs text-muted-foreground/60 hover:text-muted-foreground mt-1"
                >
                  + Add description
                </button>
              ) : null}
            </div>
            {!isReadOnly && deckGenerating && (
              <div className="mb-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/35 p-4 space-y-2">
                {flashcards.length > 0 ? (
                  <>
                    <p className="text-sm font-medium text-blue-950 dark:text-blue-50">Generating more cards</p>
                    <p className="text-sm text-blue-900/85 dark:text-blue-100/85">New cards will appear automatically.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-blue-950 dark:text-blue-50">Generating cards for this deck</p>
                    <p className="text-sm text-blue-900/85 dark:text-blue-100/85">You can leave this page and come back later.</p>
                  </>
                )}
                <div className="pt-1">
                  <Link
                    href="/decks"
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-950 text-white hover:bg-blue-900 dark:bg-blue-100 dark:text-blue-950 dark:hover:bg-white px-4 text-sm font-medium"
                  >
                    My Decks
                  </Link>
                </div>
              </div>
            )}
            {!isReadOnly && isFailed && (
              <div className="mb-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/35 p-4 space-y-1">
                <p className="text-sm font-medium text-red-950 dark:text-red-50">Generation failed</p>
                <p className="text-sm text-red-900/85 dark:text-red-100/85">Try again from Add more cards.</p>
              </div>
            )}
            {isReadOnly && isFailed && (
              <div className="mb-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/35 p-4 space-y-1">
                <p className="text-sm font-medium text-red-950 dark:text-red-50">Generation failed</p>
                <p className="text-sm text-red-900/85 dark:text-red-100/85">Any cards below are still usable.</p>
              </div>
            )}
            {isReadOnly ? (
              <p className="mb-4 text-sm text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="font-medium text-foreground">Public</span>
                <span className="text-muted-foreground/50" aria-hidden>
                  ·
                </span>
                <span>Read-only</span>
                {deckDateShort && (
                  <>
                    <span className="text-muted-foreground/50" aria-hidden>
                      ·
                    </span>
                    <span>{deckDateShort}</span>
                  </>
                )}
              </p>
            ) : (
              <div className="mb-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {deck.category_id
                    ? categories.find((c) => c.id === deck.category_id)?.name ?? "—"
                    : "Uncategorized"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCategoryModalSelectedId(deck.category_id ?? UNCATEGORIZED);
                    setShowNewCatInput(false);
                    setNewCatName("");
                    setNewCatError(null);
                    setCategoryModalOpen(true);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline px-0.5 -mx-0.5 min-h-[44px] sm:min-h-0 py-1 sm:py-0"
                >
                  Change
                </button>
                <>
                  <span className="text-muted-foreground/50" aria-hidden>
                    ·
                  </span>
                  {sessionStatus === "authenticated" && isPlatformAdmin ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const next = !deck.is_public;
                        try {
                          await updateDeck(deck.id, { is_public: next });
                          setDeck({ ...deck, is_public: next });
                        } catch {
                          /* ignore */
                        }
                      }}
                      className="h-auto min-h-[44px] sm:min-h-0 py-1.5 sm:py-0 px-1.5 text-sm font-normal text-muted-foreground hover:text-foreground"
                      aria-label={
                        deck.is_public ? "Deck is public; remove from Library" : "Deck is private; add to Library"
                      }
                    >
                      {deck.is_public ? (
                        <span className="text-emerald-600 dark:text-emerald-400">Public</span>
                      ) : (
                        "Private"
                      )}
                    </Button>
                  ) : (
                    <span
                      className={`text-sm ${
                        deck.is_public
                          ? "font-medium text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {deck.is_public ? "Public" : "Private"}
                    </span>
                  )}
                </>
                {deckDateShort && (
                  <>
                    <span className="text-muted-foreground/50" aria-hidden>
                      ·
                    </span>
                    <span>{deckDateShort}</span>
                  </>
                )}
              </div>
            )}
            {deck.source_type === "youtube" && deck.source_url ? (
              <div className="mb-4 space-y-1.5">
                <p className="text-sm text-muted-foreground flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                  <span>YouTube</span>
                  <span className="text-muted-foreground/50" aria-hidden>
                    ·
                  </span>
                  <a
                    href={deck.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground underline underline-offset-2 hover:text-muted-foreground min-w-0 break-words"
                  >
                    {deck.source_topic?.trim() || deck.source_url}
                  </a>
                </p>
                {(() => {
                  const ym = parseYoutubeDeckSourceMetadata(deck.source_metadata);
                  if (!ym) return null;
                  const parts: string[] = [];
                  if (
                    ym.duration_seconds != null &&
                    Number.isFinite(ym.duration_seconds) &&
                    ym.duration_seconds >= 0
                  ) {
                    const d = formatYoutubeDuration(ym.duration_seconds);
                    if (d) parts.push(d);
                  }
                  const cap = ym.caption_language?.trim();
                  if (cap) {
                    parts.push(/caption/i.test(cap) ? cap : `${cap} captions`);
                  }
                  if (!parts.length) return null;
                  return (
                    <p className="text-xs text-muted-foreground/80 leading-snug max-mobile:text-[11px]">
                      {parts.join(" · ")}
                    </p>
                  );
                })()}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <a
                    href={`/api/proxy/decks/${deck.id}/transcript`}
                    download
                    className="hover:text-foreground underline underline-offset-2 transition-colors"
                  >
                    Transcript
                  </a>
                  {deck.has_timestamps && (
                    <a
                      href={`/api/proxy/decks/${deck.id}/transcript/timestamped`}
                      download
                      className="hover:text-foreground underline underline-offset-2 transition-colors"
                    >
                      Timestamps
                    </a>
                  )}
                </div>
              </div>
            ) : deck.source_url ? (
              <p className="text-sm text-muted-foreground mb-4 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <span>
                  {deck.source_type
                    ? _SOURCE_TYPE_LABELS[deck.source_type] ??
                      deck.source_type.charAt(0).toUpperCase() + deck.source_type.slice(1)
                    : "URL"}
                </span>
                <span className="text-muted-foreground/50" aria-hidden>
                  ·
                </span>
                <a
                  href={deck.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-2 hover:text-muted-foreground min-w-0 break-words"
                >
                  {deck.source_topic?.trim() || deck.source_url}
                </a>
              </p>
            ) : deck.source_topic?.trim() ? (
              <p className="text-sm text-muted-foreground mb-4 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <span>
                  {deck.source_type === "text"
                    ? "Text"
                    : deck.source_type === "topic"
                      ? "Topic"
                      : deck.source_type
                        ? (_SOURCE_TYPE_LABELS[deck.source_type] ?? "Topic")
                        : "Topic"}
                </span>
                <span className="text-muted-foreground/50" aria-hidden>
                  ·
                </span>
                <span className="font-medium text-foreground">{deck.source_topic.trim()}</span>
              </p>
            ) : null}
            {!isReadOnly && categoryModalOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                onClick={() => !categorySaving && setCategoryModalOpen(false)}
              >
                <div
                  className="bg-background rounded-lg shadow-lg p-6 w-full max-w-sm mx-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h2 className="text-lg font-semibold mb-4">Move to category</h2>
                  <form onSubmit={handleMoveCategory} className="space-y-4">
                    <div>
                      <label htmlFor="deck-category" className="sr-only">
                        Category
                      </label>
                      <select
                        id="deck-category"
                        name="category"
                        value={categoryModalSelectedId}
                        onChange={(e) => setCategoryModalSelectedId(e.target.value)}
                        disabled={categorySaving || creatingCat}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[44px]"
                      >
                        <option value={UNCATEGORIZED}>Uncategorized</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {showNewCatInput ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            placeholder="New category name"
                            value={newCatName}
                            onChange={(e) => { setNewCatName(e.target.value); setNewCatError(null); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateCategory(); } }}
                            disabled={creatingCat}
                            autoFocus
                            className="h-9 flex-1"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleCreateCategory}
                            disabled={creatingCat || !newCatName.trim()}
                            className="h-9 px-3"
                          >
                            {creatingCat ? "Adding…" : "Add"}
                          </Button>
                        </div>
                        {newCatError && (
                          <p className="text-xs text-destructive">{newCatError}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => { setShowNewCatInput(false); setNewCatName(""); setNewCatError(null); }}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowNewCatInput(true)}
                        disabled={categorySaving}
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
                        onClick={() => !categorySaving && setCategoryModalOpen(false)}
                        disabled={categorySaving || creatingCat}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={categorySaving || creatingCat}>
                        {categorySaving ? "Moving..." : "Move"}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {flashcards.length > 0 ? (
                <Link
                  href={`/study/${deck.id}`}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-4 text-sm font-medium max-mobile:min-h-[44px]"
                >
                  Explore
                </Link>
              ) : (
                <span className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900/40 text-white/60 dark:bg-neutral-100/40 dark:text-neutral-900/60 px-4 text-sm font-medium cursor-not-allowed max-mobile:min-h-[44px]">
                  Explore
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-muted-foreground hover:text-foreground"
                disabled={flashcards.length === 0}
                onClick={() => {
                  const catName = deck.category_id
                    ? categories.find((c) => c.id === deck.category_id)?.name ?? null
                    : null;
                  exportDeckAsTxt(deck, catName, flashcards);
                }}
                aria-label="Export as .txt"
              >
                <Download className="size-4" />
              </Button>
              {isReadOnly && (
                <Button
                  onClick={handleDuplicate}
                  disabled={duplicating}
                  className="max-mobile:min-h-[44px]"
                >
                  {duplicating ? "Saving…" : "Save to my decks"}
                </Button>
              )}
            </div>
            {!isReadOnly && (hasFlashcards && !genPanelExpanded ? (
              <div className="mt-4 pt-4 border-t border-border/80">
                <button
                  type="button"
                  onClick={() => setGenPanelExpanded(true)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/35 hover:text-foreground"
                >
                  <span className="font-medium">Add more cards</span>
                  <ChevronRight className="size-4 shrink-0 opacity-70" aria-hidden />
                </button>
              </div>
            ) : (
              <div
                className={`generate-box mt-4 pt-4 border-t border-border space-y-4 ${
                  hasFlashcards
                    ? "rounded-lg border border-border/50 bg-muted/20 px-4 py-4 max-mobile:px-3 max-mobile:py-3"
                    : "max-mobile:p-3.5"
                }`}
              >
                  <div className="flex items-start justify-between gap-2">
                  <p className={`font-semibold tracking-tight ${hasFlashcards ? "text-xs text-muted-foreground" : "text-sm"}`}>
                    {hasFlashcards ? "Add more cards" : "Generate flashcards"}
                  </p>
                  {hasFlashcards && (
                    <button
                      type="button"
                      onClick={() => setGenPanelExpanded(false)}
                      className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                      aria-label="Collapse add-cards section"
                    >
                      <ChevronUp className="size-4" aria-hidden />
                    </button>
                  )}
                </div>

                <div
                  className="inline-flex rounded-lg border border-border/50 bg-muted/30 p-0.5"
                  role="radiogroup"
                  aria-label="Generation source"
                >
                  {(
                    [
                      { value: "topic" as const, label: "Topic" },
                      { value: "text" as const, label: "Text" },
                      { value: "import" as const, label: "Import" },
                    ] as const
                  ).map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={genMode === value}
                      onClick={() => setGenMode(value)}
                      className={`min-w-[5.5rem] rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        genMode === value
                          ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {genMode === "topic" && (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-2">
                      <label htmlFor="gen-topic" className="text-sm font-medium">
                        Topic
                      </label>
                      <Input
                        id="gen-topic"
                        name="genTopic"
                        placeholder="e.g. Photosynthesis, Spanish verbs"
                        value={genTopic}
                        onChange={(e) => setGenTopic(e.target.value)}
                        autoComplete="off"
                        className="min-w-0"
                      />
                      <p className="text-xs text-muted-foreground">
                        Leave empty to skip generation.
                      </p>
                    </div>
                    {!genTopic.trim() && (
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={useNameAsTopic}
                          onChange={(e) => setUseNameAsTopic(e.target.checked)}
                          className="rounded border-input"
                        />
                        <span className="text-muted-foreground">
                          Use deck name as topic for generation
                        </span>
                      </label>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <label htmlFor="cardCount-topic" className="text-sm font-medium shrink-0">
                        Number of cards
                      </label>
                      <select
                        id="cardCount-topic"
                        value={cardCount}
                        onChange={(e) => setCardCount(Number(e.target.value))}
                        className="h-9 min-w-[4.5rem] rounded-md border border-input bg-background px-2.5 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {cardCountOptions.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {genMode === "text" && (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-2">
                      <label htmlFor="gen-text" className="text-sm font-medium">
                        Paste notes or transcript
                      </label>
                      <textarea
                        id="gen-text"
                        name="genText"
                        placeholder="Paste notes, lecture content, or any text to generate flashcards from…"
                        value={genText}
                        onChange={(e) => {
                          setGenText(e.target.value);
                          if (genTextUploadStatus) setGenTextUploadStatus(null);
                        }}
                        maxLength={GENERATION_TEXT_MAX_CHARS}
                        className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <input
                            ref={genTextFileInputRef}
                            id="gen-text-upload"
                            type="file"
                            accept=".txt,text/plain"
                            onChange={handleGenTextFileUpload}
                            className="sr-only"
                          />
                          <label
                            htmlFor="gen-text-upload"
                            className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Upload className="size-3.5 shrink-0" />
                            Upload .txt
                          </label>
                          {genTextUploadStatus && (
                            <span
                              className={`text-xs ${genTextUploadStatus.startsWith("Only ") || genTextUploadStatus.startsWith("That ") || genTextUploadStatus.startsWith("Could ") ? "text-destructive" : "text-muted-foreground"}`}
                            >
                              {genTextUploadStatus}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 sm:ml-auto">
                          <span className="text-xs text-muted-foreground">
                            {genText.length} / {GENERATION_TEXT_MAX_CHARS.toLocaleString()} characters
                          </span>
                          {genText.length >= GENERATION_TEXT_MAX_CHARS && (
                            <span className="text-xs text-destructive">Text is too long</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <label htmlFor="cardCount-text" className="text-sm font-medium shrink-0">
                        Number of cards
                      </label>
                      <select
                        id="cardCount-text"
                        value={cardCount}
                        onChange={(e) => setCardCount(Number(e.target.value))}
                        className="h-9 min-w-[4.5rem] rounded-md border border-input bg-background px-2.5 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {cardCountOptions.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {genMode === "import" && (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-2">
                      <label htmlFor="import-text" className="text-sm font-medium">
                        Paste Q/A text or upload a .txt file
                      </label>
                      <textarea
                        id="import-text"
                        placeholder={"Q: What is photosynthesis?\nA: The process by which plants convert light energy into chemical energy.\n\nQ: What is mitosis?\nA: A type of cell division that results in two identical daughter cells."}
                        value={importText}
                        onChange={(e) => { setImportText(e.target.value); setImportResult(null); setImportError(null); setImportFiles([]); }}
                        className="w-full min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                      />
                      <div className="flex items-center gap-3">
                        <label
                          htmlFor="import-file"
                          className="inline-flex items-center gap-1.5 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Upload className="size-3.5" />
                          Upload .txt files
                        </label>
                        <input
                          ref={fileInputRef}
                          id="import-file"
                          type="file"
                          accept=".txt,text/plain"
                          multiple
                          onChange={handleFileUpload}
                          className="sr-only"
                        />
                      </div>
                    </div>
                    {importFiles.length > 0 && (
                      <div className="text-xs space-y-0.5">
                        {importFiles.map((f) => (
                          <p key={f.name} className={f.error ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                            {f.name}{f.error ? ` — ${f.error}` : ` — ${f.pairCount} pair${f.pairCount === 1 ? "" : "s"}`}
                          </p>
                        ))}
                      </div>
                    )}
                    {importQAPairs && importQAPairs.length > 0 && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        {importQAPairs.length} Q/A pair{importQAPairs.length === 1 ? "" : "s"} detected — will be imported directly, no AI.
                      </p>
                    )}
                    {importText.trim() && !importQAPairs && importFiles.length === 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        No valid Q:/A: pairs found. Each card needs a Q: and A: line.
                      </p>
                    )}
                    {importError && (
                      <p className="text-xs text-destructive">{importError}</p>
                    )}
                    {importResult && (
                      <p className="text-xs text-muted-foreground">
                        Imported {importResult.created} card{importResult.created === 1 ? "" : "s"}
                        {importResult.skipped > 0 ? `, ${importResult.skipped} duplicate${importResult.skipped === 1 ? "" : "s"} skipped` : ""}.
                      </p>
                    )}
                  </div>
                )}

                {generationPanelBusy && (
                  <div
                    className="space-y-2 rounded-md border border-border/50 bg-muted/25 px-3 py-2.5 max-mobile:py-2"
                    aria-live="polite"
                    aria-busy="true"
                  >
                    <div
                      className="h-1 w-full overflow-hidden rounded-full bg-muted/90 dark:bg-muted/50"
                      role="progressbar"
                      aria-label={genMode === "import" ? "Importing" : "Generating"}
                    >
                      <div className="h-full w-[38%] rounded-full bg-primary/40 deck-load-indeterminate-fill" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm text-foreground/90 leading-snug">
                        {generationPanelBusy.primary}
                      </p>
                      {generationPanelBusy.secondary ? (
                        <p className="text-xs text-muted-foreground leading-snug">
                          {generationPanelBusy.secondary}
                        </p>
                      ) : null}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  {genMode === "import" ? (
                    <Button
                      type="button"
                      onClick={handleImport}
                      disabled={generating || !importQAPairs || importQAPairs.length === 0}
                      className="w-full sm:w-auto"
                    >
                      {generating
                        ? "Importing…"
                        : importQAPairs && importQAPairs.length > 0
                          ? `Import ${importQAPairs.length} Card${importQAPairs.length === 1 ? "" : "s"}`
                          : "Import Cards"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleGenerate}
                      disabled={generating || (genMode === "text" && genText.length > GENERATION_TEXT_MAX_CHARS)}
                      className="w-full sm:w-auto"
                    >
                      {generating ? "Generating…" : "Generate Cards"}
                    </Button>
                  )}
                  <Link
                    href={`/decks/${deck.id}/add-card`}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="size-3.5" />
                    Add manually
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <section className="section space-y-4 mt-10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight">
              Flashcards
              {flashcards.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {flashcards.length}
                </span>
              )}
            </h2>
            {flashcards.length > 0 && (
              <div className="flex items-center gap-2">
                <div
                  className="inline-flex rounded-lg border border-border/50 bg-muted/30 p-0.5"
                  role="radiogroup"
                  aria-label="Card display view"
                >
                  {(
                    [
                      { value: "list" as const, icon: List, label: "List view" },
                      { value: "grid" as const, icon: LayoutGrid, label: "Grid view" },
                    ] as const
                  ).map(({ value, icon: Icon, label }) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={cardView === value}
                      aria-label={label}
                      onClick={() => setCardView(value)}
                      className={`rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        cardView === value
                          ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="size-4" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {flashcards.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search this deck…"
                  value={cardSearch}
                  onChange={(e) => { setCardSearch(e.target.value); setCardsExpanded(false); }}
                  className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <select
                value={cardSort}
                onChange={(e) => setCardSort(e.target.value as SortOption)}
                aria-label="Sort cards"
                className="h-8 rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {isSearching && (
                <span className="text-xs text-muted-foreground">
                  {processedCards.length} result{processedCards.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          )}
          {deckGenerating && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/30 p-3 mb-4 space-y-2">
              <div
                className="h-1 w-full max-w-md overflow-hidden rounded-full bg-blue-200/80 dark:bg-blue-900/60"
                role="progressbar"
                aria-label="Generating"
              >
                <div className="h-full w-[38%] rounded-full bg-blue-500/50 dark:bg-blue-400/45 deck-load-indeterminate-fill" />
              </div>
              <p className="text-sm text-blue-950 dark:text-blue-50 font-medium">Generating…</p>
              <p className="text-xs text-blue-800/90 dark:text-blue-200/90">New cards will appear here.</p>
            </div>
          )}
          {flashcards.length === 0 && !deckGenerating && !isFailed ? (
            <p className="text-muted-foreground text-sm">No flashcards yet.</p>
          ) : flashcards.length === 0 ? (
            null
          ) : processedCards.length === 0 ? (
            <p className="text-muted-foreground text-sm">No cards match your search.</p>
          ) : cardView === "list" ? (
            <div className="space-y-3 max-mobile:space-y-2.5">
              {visibleCards.map((card, index) => (
                <div
                  key={card.id}
                  className="flashcard-item group rounded-xl border border-neutral-200 px-4 py-3 flex items-start justify-between gap-3 bg-white dark:bg-neutral-900 dark:border-neutral-700 max-mobile:p-3.5 max-mobile:rounded-[12px]"
                >
                  <button
                    type="button"
                    onClick={() => setModalCardIndex(index)}
                    className="flex-1 min-w-0 text-start cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    <div className="flex flex-col gap-1.5">
                      <div dir="auto" className="font-semibold text-xl leading-snug max-mobile:text-lg max-mobile:leading-snug">
                        {card.question}
                      </div>
                      <div dir="auto" className="text-sm text-muted-foreground leading-relaxed max-mobile:text-[13px] line-clamp-2">
                        <FormattedText text={card.answer_short} className="text-inherit" />
                      </div>
                    </div>
                  </button>
                  {!isReadOnly && (
                    <div className="relative flex-shrink-0 mt-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setGridMenuOpenId(gridMenuOpenId === card.id ? null : card.id);
                        }}
                        className="h-8 w-8 max-mobile:min-h-[44px] max-mobile:min-w-[44px] max-mobile:w-[44px] max-mobile:h-[44px] flex items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-mobile:opacity-100 hover:bg-muted hover:text-foreground transition-all focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label="Card actions"
                        aria-expanded={gridMenuOpenId === card.id}
                        aria-haspopup="menu"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                      {gridMenuOpenId === card.id && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            aria-hidden
                            onClick={() => setGridMenuOpenId(null)}
                          />
                          <div
                            role="menu"
                            className="absolute right-0 top-full mt-1 z-50 min-w-[128px] rounded-lg border border-border bg-background shadow-md py-1"
                          >
                            <Link
                              role="menuitem"
                              href={`/decks/${params.id}/edit-card/${card.id}`}
                              onClick={() => setGridMenuOpenId(null)}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors max-mobile:min-h-[44px]"
                            >
                              <Pencil className="size-3.5 shrink-0" />
                              Edit
                            </Link>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setGridMenuOpenId(null);
                                setDeleteConfirmId(card.id);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-muted transition-colors max-mobile:min-h-[44px]"
                            >
                              <Trash2 className="size-3.5 shrink-0" />
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-mobile:gap-2.5">
              {visibleCards.map((card, index) => (
                <div
                  key={card.id}
                  className="group rounded-xl border border-neutral-200 bg-white dark:bg-neutral-900 dark:border-neutral-700 flex flex-col overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setModalCardIndex(index)}
                    className="flex-1 text-start cursor-pointer p-4 max-mobile:p-3.5 hover:bg-muted/30 transition-colors"
                  >
                    <div dir="auto" className="font-semibold text-base leading-snug line-clamp-3 mb-2">
                      {card.question}
                    </div>
                    <div dir="auto" className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                      <FormattedText text={card.answer_short} className="text-inherit" />
                    </div>
                  </button>
                  {!isReadOnly && (
                    <div className="relative flex items-center px-3 py-1.5 border-t border-border/50">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setGridMenuOpenId(gridMenuOpenId === card.id ? null : card.id);
                        }}
                        className="h-7 w-7 max-mobile:min-h-[44px] max-mobile:min-w-[44px] flex items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-mobile:opacity-100 hover:bg-muted hover:text-foreground transition-all focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label="Card actions"
                        aria-expanded={gridMenuOpenId === card.id}
                        aria-haspopup="menu"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                      {gridMenuOpenId === card.id && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            aria-hidden
                            onClick={() => setGridMenuOpenId(null)}
                          />
                          <div
                            role="menu"
                            className="absolute left-2 bottom-full mb-1 z-50 min-w-[128px] rounded-lg border border-border bg-background shadow-md py-1"
                          >
                            <Link
                              role="menuitem"
                              href={`/decks/${params.id}/edit-card/${card.id}`}
                              onClick={() => setGridMenuOpenId(null)}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors max-mobile:min-h-[44px]"
                            >
                              <Pencil className="size-3.5 shrink-0" />
                              Edit
                            </Link>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setGridMenuOpenId(null);
                                setDeleteConfirmId(card.id);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-muted transition-colors max-mobile:min-h-[44px]"
                            >
                              <Trash2 className="size-3.5 shrink-0" />
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {hasOverflow && (
            <button
              type="button"
              onClick={() => setCardsExpanded((v) => !v)}
              className="mt-3 w-full rounded-lg border border-dashed border-border/80 bg-muted/20 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              {cardsExpanded
                ? "Show less"
                : `Show all ${processedCards.length} cards`}
            </button>
          )}
        </section>

        {canOfferAdminTransfer && deck && (
          <section className="section space-y-3 pt-8 border-t border-border">
            <h2 className="text-lg font-semibold">Admin</h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
              This deck belongs to a public/legacy account. You can move it into your
              Google-linked account. Cards and source data stay the same; it will no
              longer appear under the original owner.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="gap-2"
              onClick={() => setTransferConfirmOpen(true)}
            >
              <ArrowRightLeft className="size-4 shrink-0" aria-hidden />
              Move to my account
            </Button>
          </section>
        )}

        {relatedDecks.length > 0 && (
          <section className="section space-y-4 pt-8 border-t border-border">
            <h2 className="text-lg font-semibold">More from this category</h2>
            <div className="space-y-2">
              {relatedDecks.map((d) => (
                <Link
                  key={d.id}
                  href={`/decks/${d.id}`}
                  className="block rounded-xl border border-neutral-200 px-4 py-3 bg-white dark:bg-neutral-900 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors max-mobile:p-3.5 max-mobile:rounded-[12px]"
                >
                  <span className="font-medium text-foreground">{d.name}</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    {d.card_count} {d.card_count === 1 ? "card" : "cards"}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {!isReadOnly && <section className="section space-y-4 pt-8 border-t border-border">
          <h2 className="text-lg font-semibold">Danger Zone</h2>
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="font-medium mb-1">Delete deck</p>
            <p className="text-sm text-muted-foreground mb-3">
              This will permanently delete the deck and all flashcards.
            </p>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeckDeleteConfirm(true)}
            >
              Delete Deck
            </Button>
          </div>
        </section>}

        <FlashcardModal
          cards={processedCards}
          initialIndex={modalCardIndex ?? 0}
          isOpen={modalCardIndex !== null}
          onClose={() => setModalCardIndex(null)}
          editBasePath={isReadOnly ? undefined : `/decks/${params.id}/edit-card`}
        />

        {!isReadOnly && deleteConfirmId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setDeleteConfirmId(null)}
          >
            <div
              className="bg-background rounded-lg shadow-lg p-6 w-full max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-4">Delete this card?</h2>
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
                  onClick={() => deleteConfirmId && handleDeleteCard(deleteConfirmId)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}

        <AdminTransferDeckConfirmModal
          open={transferConfirmOpen}
          onOpenChange={setTransferConfirmOpen}
          deck={
            transferConfirmOpen && deck
              ? {
                  id: deck.id,
                  owner_name: deck.owner_name,
                  owner_email: deck.owner_email,
                }
              : null
          }
          onTransferred={async (data) => {
            setDeck(data as Deck);
            if (session?.backendUserId) {
              const cats = await getCategories(session.backendUserId);
              setCategories(Array.isArray(cats) ? cats : []);
            }
            router.refresh();
          }}
        />

        {!isReadOnly && deckDeleteConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setDeckDeleteConfirm(false)}
          >
            <div
              className="bg-background rounded-lg shadow-lg p-6 w-full max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-2">Delete this deck?</h2>
              <p className="text-sm text-muted-foreground mb-4">
                This will permanently delete:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside mb-4 space-y-1">
                <li>the deck</li>
                <li>all flashcards inside it</li>
              </ul>
              <p className="text-sm text-muted-foreground mb-4">
                This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeckDeleteConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteDeck}
                >
                  Delete Deck
                </Button>
              </div>
            </div>
          </div>
        )}
    </PageContainer>
  );
}
