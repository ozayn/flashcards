"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  ChevronUp,
  Download,
  Pencil,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getDeck,
  getFlashcards,
  getRelatedDecks,
  getCategories,
  generateFlashcards,
  updateDeck,
  deleteDeck,
  deleteFlashcard,
  moveDeckToCategory,
} from "@/lib/api";
import PageContainer from "@/components/layout/page-container";
import FormattedText from "@/components/FormattedText";
import { FlashcardModal } from "@/components/FlashcardModal";

interface DeckPageProps {
  params: { id: string };
}

interface Deck {
  id: string;
  name: string;
  description: string | null;
  source_type?: string | null;
  source_topic?: string | null;
  archived?: boolean;
  category_id?: string | null;
  user_id?: string;
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

function exportDeckAsTxt(
  deckName: string,
  categoryName: string,
  cards: Flashcard[]
): void {
  const lines: string[] = [
    deckName.trim().toUpperCase(),
    `Category: ${categoryName}`,
    `Cards: ${cards.length}`,
    "",
  ];

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
  a.download = `${slugFromTitle(deckName)}.txt`;
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
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [title, setTitle] = useState(deck?.name ?? "");
  const [description, setDescription] = useState(deck?.description ?? "");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deckDeleteConfirm, setDeckDeleteConfirm] = useState(false);
  const [modalCardIndex, setModalCardIndex] = useState<number | null>(null);
  const [genTopic, setGenTopic] = useState("");
  const [genText, setGenText] = useState("");
  const [genMode, setGenMode] = useState<"topic" | "text">("topic");
  const [useNameAsTopic, setUseNameAsTopic] = useState(false);
  const [cardCount, setCardCount] = useState(10);
  const GEN_TEXT_MAX_LENGTH = 10000;
  const CARD_COUNT_OPTIONS = [5, 10, 20, 30, 40, 50] as const;

  const hasFlashcards = flashcards.length > 0;
  const [genPanelExpanded, setGenPanelExpanded] = useState(true);
  const prevFlashcardCountRef = useRef(-1);

  useEffect(() => {
    const n = flashcards.length;
    const prev = prevFlashcardCountRef.current;
    if (prev === 0 && n > 0) {
      setGenPanelExpanded(false);
    }
    if (n === 0) {
      setGenPanelExpanded(true);
    }
    prevFlashcardCountRef.current = n;
  }, [flashcards.length]);

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

  useEffect(() => {
    if (deck) {
      setTitle(deck.name ?? "");
      setDescription(deck.description ?? "");
    }
  }, [deck]);

  async function handleGenerate() {
    if (!deck || generating) return;
    const topicTrimmed = genTopic.trim();
    const textTrimmed = genText.trim();
    const effectiveTopic =
      topicTrimmed || (useNameAsTopic && !topicTrimmed ? title.trim() : "");
    if (genMode === "topic" && !effectiveTopic) return;
    if (genMode === "text" && !textTrimmed) return;
    setGenerating(true);
    try {
      if (genMode === "text") {
        await generateFlashcards({
          deck_id: deck.id,
          text: textTrimmed,
          num_cards: cardCount,
          language: "en",
        });
      } else {
        await generateFlashcards({
          deck_id: deck.id,
          topic: effectiveTopic,
          num_cards: cardCount,
          language: "en",
        });
      }
      setGenTopic("");
      setGenText("");
      const data = await getFlashcards(params.id);
      setFlashcards(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
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

  if (loading) {
    return (
      <PageContainer>
        <p className="text-muted-foreground">Loading deck...</p>
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

  return (
    <PageContainer>
        <div className="flex items-center justify-between">
          <Link
            href="/decks"
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
          >
            ← Back
          </Link>
          <Button
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
          </Button>
        </div>

        <Card>
          <div className="px-4 pt-4 pb-4">
            <div className="flex flex-col gap-2 mb-4">
              {editingTitle ? (
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
                <h1
                  className="text-2xl font-semibold cursor-pointer"
                  onClick={() => setEditingTitle(true)}
                >
                  {title}
                </h1>
              )}
              {editingDescription ? (
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
                  className="border rounded px-2 py-1 w-full min-h-[80px] text-sm text-neutral-500 mb-3"
                  autoFocus
                />
              ) : (
                <p
                  className="text-sm text-neutral-500 mb-3 cursor-pointer dark:text-neutral-400"
                  onClick={() => setEditingDescription(true)}
                >
                  {description || "Click to add description"}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-sm text-muted-foreground">
                Category:{" "}
                <span className="font-medium text-foreground">
                  {deck.category_id
                    ? categories.find((c) => c.id === deck.category_id)?.name ?? "—"
                    : "Uncategorized"}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCategoryModalSelectedId(deck.category_id ?? UNCATEGORIZED);
                  setCategoryModalOpen(true);
                }}
                className="text-muted-foreground hover:text-foreground h-7 px-2"
              >
                {deck.category_id ? "Change category" : "Assign category"}
              </Button>
            </div>
            {deck.source_topic?.trim() && (
              <p className="text-sm mb-4 leading-relaxed">
                <span className="text-muted-foreground">Generated from topic:</span>{" "}
                <span className="font-medium text-foreground">{deck.source_topic.trim()}</span>
              </p>
            )}
            {categoryModalOpen && (
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
                        disabled={categorySaving}
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
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => !categorySaving && setCategoryModalOpen(false)}
                        disabled={categorySaving}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={categorySaving}>
                        {categorySaving ? "Moving..." : "Move"}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/study/${deck.id}`}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-4 text-sm font-medium w-full sm:w-auto max-mobile:min-h-[44px] max-mobile:rounded-[10px] max-mobile:font-semibold max-mobile:text-[15px]"
              >
                Study
              </Link>
              <Link
                href={`/decks/${deck.id}/add-card`}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:bg-neutral-800 px-4 text-sm font-medium w-full sm:w-auto max-mobile:min-h-[44px] max-mobile:rounded-[10px] max-mobile:text-[15px]"
              >
                Add Card
              </Link>
              <Button
                variant="outline"
                size="default"
                className="inline-flex h-10 gap-2"
                disabled={flashcards.length === 0}
                onClick={() => {
                  const catName = deck.category_id
                    ? categories.find((c) => c.id === deck.category_id)?.name ?? "—"
                    : "Uncategorized";
                  exportDeckAsTxt(title || deck.name, catName, flashcards);
                }}
              >
                <Download className="size-4" />
                Export .txt
              </Button>
            </div>
            {hasFlashcards && !genPanelExpanded ? (
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
                  <div className="space-y-0.5">
                    <p className={`font-semibold tracking-tight ${hasFlashcards ? "text-xs text-muted-foreground" : "text-sm"}`}>
                      {hasFlashcards ? "Add more cards" : "Generate flashcards"}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Choose Topic or Text, then generate cards.
                    </p>
                  </div>
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
                        Optional. Leave empty to skip generation.
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
                        {CARD_COUNT_OPTIONS.map((n) => (
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
                        placeholder="Paste notes or text to generate flashcards..."
                        value={genText}
                        onChange={(e) => setGenText(e.target.value)}
                        maxLength={GEN_TEXT_MAX_LENGTH}
                        className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">
                          {genText.length} / {GEN_TEXT_MAX_LENGTH} characters
                        </span>
                        {genText.length >= GEN_TEXT_MAX_LENGTH && (
                          <span className="text-xs text-destructive">Text is too long</span>
                        )}
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
                        {CARD_COUNT_OPTIONS.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <Button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating || genText.length > GEN_TEXT_MAX_LENGTH}
                  className="w-full sm:w-auto"
                >
                  {generating ? "Generating..." : "Generate Cards"}
                </Button>
              </div>
            )}
          </div>
        </Card>

        <section className="section space-y-4 mt-10">
          <h2 className="text-xl font-semibold tracking-tight">Flashcards</h2>
          {flashcards.length === 0 ? (
            <p className="text-muted-foreground text-sm">No flashcards yet.</p>
          ) : (
            <div className="space-y-3 max-mobile:space-y-2.5">
              {flashcards.map((card, index) => (
                <div
                  key={card.id}
                  className="flashcard-item rounded-xl border border-neutral-200 px-4 py-3 flex items-start justify-between gap-3 bg-white dark:bg-neutral-900 dark:border-neutral-700 max-mobile:p-3.5 max-mobile:rounded-[12px]"
                >
                  <button
                    type="button"
                    onClick={() => setModalCardIndex(index)}
                    className="flex-1 min-w-0 text-start cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    <div className="flex flex-col gap-1">
                      <div dir="auto" className="font-medium text-base leading-snug max-mobile:text-[15px] max-mobile:leading-[1.4]">
                        {card.question}
                      </div>
                      <div dir="auto" className="text-sm text-neutral-500 leading-snug dark:text-neutral-400 max-mobile:text-[14px] max-mobile:text-[#555] dark:max-mobile:text-neutral-400 line-clamp-2">
                        <FormattedText text={card.answer_short} className="text-inherit" />
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0 mt-1 [&_svg]:max-mobile:!size-4">
                    <Link
                      href={`/decks/${params.id}/edit-card/${card.id}`}
                      className="inline-flex"
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Edit card"
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteConfirmId(card.id);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Delete card"
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

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

        <section className="section space-y-4 pt-8 border-t border-border">
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
        </section>

        <FlashcardModal
          cards={flashcards}
          initialIndex={modalCardIndex ?? 0}
          isOpen={modalCardIndex !== null}
          onClose={() => setModalCardIndex(null)}
          editBasePath={`/decks/${params.id}/edit-card`}
        />

        {deleteConfirmId && (
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

        {deckDeleteConfirm && (
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
