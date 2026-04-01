/**
 * Client-side: call same-origin Next.js API proxy. Server-side proxy uses
 * API_INTERNAL_URL (Railway private networking) when available.
 */
const API_BASE = "/api/proxy";

/** For display only (e.g. error messages). Public URL, not used for requests. */
export const apiUrl =
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");

export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/** Lightweight API availability check using GET /. */
export async function checkApiAvailability(timeoutMs = 8000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${API_BASE}/`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/** Poll until the API responds or the time budget is exhausted (cold-start friendly). */
export async function waitForApiReadiness(options?: {
  budgetMs?: number;
  retryDelayMs?: number;
  timeoutPerAttemptMs?: number;
}): Promise<boolean> {
  const budgetMs = options?.budgetMs ?? 14_000;
  const retryDelayMs = options?.retryDelayMs ?? 1_500;
  const timeoutPerAttemptMs = options?.timeoutPerAttemptMs ?? 8000;
  const start = Date.now();
  while (Date.now() - start < budgetMs) {
    if (await checkApiAvailability(timeoutPerAttemptMs)) {
      return true;
    }
    const remaining = budgetMs - (Date.now() - start);
    if (remaining <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(retryDelayMs, remaining)));
  }
  return false;
}

export async function getUsers() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${API_BASE}/users`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error("Failed to fetch users");
    return res.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

export async function createUser(data: {
  email: string;
  name: string;
  role?: string;
  plan?: string;
}) {
    const res = await fetch(`${API_BASE}/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: data.email,
      name: data.name,
      role: data.role ?? "user",
      plan: data.plan ?? "free",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to create user");
  }

  return res.json();
}

export async function getDecks(userId: string, archived = false) {
  const res = await fetch(
    `${API_BASE}/decks?user_id=${userId}&archived=${archived}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to fetch decks");
  return res.json();
}

export async function getLibraryDecks() {
  const res = await fetch(`${API_BASE}/decks/library`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch library decks");
  return res.json();
}

export async function duplicateDeck(deckId: string, userId: string) {
  const res = await fetch(`${API_BASE}/decks/${deckId}/duplicate?user_id=${userId}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to duplicate deck");
  }
  return res.json();
}

export async function getDeck(deckId: string) {
  const res = await fetch(`${API_BASE}/decks/${deckId}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch deck");
  return res.json();
}

export async function getRelatedDecks(deckId: string, limit = 4) {
  const res = await fetch(
    `${API_BASE}/decks/${deckId}/related?limit=${limit}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to fetch related decks");
  return res.json();
}

export async function createDeck(data: {
  user_id: string;
  name: string;
  description?: string;
  source_type?: string;
  source_url?: string | null;
  source_topic?: string | null;
  source_text?: string | null;
  source_segments?: string | null;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const body: Record<string, unknown> = {
      ...data,
      source_type: data.source_type ?? "topic",
    };
    if (data.source_topic === undefined) delete body.source_topic;
    if (data.source_url === undefined) delete body.source_url;
    if (data.source_text === undefined) delete body.source_text;
    if (data.source_segments === undefined) delete body.source_segments;
    const res = await fetch(`${API_BASE}/decks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error("Failed to create deck");
    return res.json();
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Request timed out. Check if the API is running and reachable.");
    }
    throw e;
  }
}

const _YT_ID_PATTERNS = [
  /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/i,
  /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/i,
  /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/i,
  /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i,
  /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/i,
];

export function extractYouTubeVideoId(url: string): string | null {
  const trimmed = url.trim();
  for (const pattern of _YT_ID_PATTERNS) {
    const m = pattern.exec(trimmed);
    if (m) return m[1];
  }
  return null;
}

export function normalizeYouTubeUrl(url: string): string {
  const id = extractYouTubeVideoId(url);
  if (id) return `https://www.youtube.com/watch?v=${id}`;
  return url.trim();
}

export function isYouTubePlaylistUrl(url: string): boolean {
  const t = url.trim();
  if (/youtube\.com\/playlist\b/i.test(t)) return true;
  if (/[?&]list=/i.test(t) && /youtube\.com|youtu\.be/i.test(t)) return true;
  return false;
}

export class TranscriptFetchError extends Error {
  title: string | null;
  constructor(message: string, title: string | null = null) {
    super(message);
    this.title = title;
  }
}

export async function fetchYouTubeTranscript(url: string): Promise<{
  video_id: string;
  title: string | null;
  transcript: string;
  segments: { text: string; start: number }[];
  language: string | null;
  char_count: number;
}> {
  const res = await fetch(`${API_BASE}/youtube/transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    if (detail && typeof detail === "object") {
      throw new TranscriptFetchError(
        detail.message || "Failed to fetch transcript",
        detail.title || null,
      );
    }
    throw new TranscriptFetchError(
      typeof detail === "string" ? detail : "Failed to fetch transcript",
    );
  }
  return res.json();
}

export async function fetchWebpageContent(url: string): Promise<{
  url: string;
  title: string | null;
  text: string;
  char_count: number;
  source_type: string;
}> {
  const res = await fetch(`${API_BASE}/webpage/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? "Failed to extract page content");
  }
  return res.json();
}

export async function moveDeckToCategory(deckId: string, categoryId: string | null) {
  const res = await fetch(`${API_BASE}/decks/${deckId}/move`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category_id: categoryId }),
  });
  if (!res.ok) throw new Error("Failed to move deck");
  return res.json();
}

export async function updateDeck(
  deckId: string,
  data: { name?: string; description?: string; archived?: boolean; is_public?: boolean; category_id?: string | null }
) {
  const res = await fetch(`${API_BASE}/decks/${deckId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to update deck");

  return res.json();
}

export async function deleteDeck(deckId: string) {
  const res = await fetch(`${API_BASE}/decks/${deckId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete deck");
}

export async function deleteDeckReviews(deckId: string, userId: string) {
  const url = `${API_BASE}/decks/${deckId}/reviews?user_id=${encodeURIComponent(userId)}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to reset deck progress");
  return res.json();
}

export async function getCategories(userId: string) {
  const res = await fetch(`${API_BASE}/categories?user_id=${userId}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch categories");
  return res.json();
}

export async function createCategory(data: { name: string; user_id: string }) {
  const res = await fetch(`${API_BASE}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to create category");
  }
  return res.json();
}

export async function updateCategory(
  id: string,
  data: { name: string },
  userId: string
) {
  const res = await fetch(`${API_BASE}/categories/${id}?user_id=${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to update category");
  }
  return res.json();
}

export async function getCategoryDecks(categoryId: string, userId: string) {
  const res = await fetch(
    `${API_BASE}/categories/${categoryId}/decks?user_id=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to fetch category decks");
  return res.json();
}

export async function deleteCategory(id: string, userId: string) {
  const res = await fetch(`${API_BASE}/categories/${id}?user_id=${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete category");
}

export async function getFlashcards(
  deckId: string,
  options?: { dueOnly?: boolean; userId?: string }
) {
  const dueOnly = options?.dueOnly ?? false;
  const userId = options?.userId;
  let url = `${API_BASE}/decks/${deckId}/flashcards?due_only=${dueOnly}`;
  if (dueOnly && userId) {
    url += `&user_id=${encodeURIComponent(userId)}`;
  }
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch flashcards");
  return res.json();
}

export async function createFlashcard(data: {
  deck_id: string;
  question: string;
  answer_short: string;
  answer_detailed?: string;
  difficulty?: string;
}) {
  const res = await fetch(`${API_BASE}/flashcards`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to create flashcard");

  return res.json();
}

export async function importFlashcards(data: {
  deck_id: string;
  cards: { question: string; answer_short: string; answer_detailed?: string }[];
}): Promise<{ created: number; skipped: number }> {
  const res = await fetch(`${API_BASE}/flashcards/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to import flashcards");
  return res.json();
}

export function parseQAPairs(
  text: string
): { question: string; answer_short: string }[] | null {
  const lines = text.split(/\n/);
  const pairs: { question: string; answer_short: string }[] = [];
  let currentQ: string | null = null;
  let currentA: string[] = [];

  const flushPair = () => {
    if (currentQ !== null && currentA.length > 0) {
      const q = currentQ.trim();
      const a = currentA.join("\n").trim();
      if (q && a) pairs.push({ question: q, answer_short: a });
    }
    currentQ = null;
    currentA = [];
  };

  for (const line of lines) {
    const qMatch = line.match(/^Q:\s*(.+)/i);
    const aMatch = line.match(/^A:\s*(.+)/i);

    if (qMatch) {
      flushPair();
      currentQ = qMatch[1];
    } else if (aMatch && currentQ !== null) {
      currentA.push(aMatch[1]);
    } else if (currentA.length > 0 && line.trim()) {
      currentA.push(line);
    }
  }
  flushPair();

  return pairs.length >= 2 ? pairs : null;
}

export async function getFlashcard(flashcardId: string) {
  const res = await fetch(`${API_BASE}/flashcards/${flashcardId}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch flashcard");
  return res.json();
}

export async function updateFlashcard(
  flashcardId: string,
  data: {
    question?: string;
    answer_short?: string;
    answer_detailed?: string;
    difficulty?: string;
  }
) {
  const res = await fetch(`${API_BASE}/flashcards/${flashcardId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to update flashcard");

  return res.json();
}

export async function deleteFlashcard(flashcardId: string) {
  const res = await fetch(`${API_BASE}/flashcards/${flashcardId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete flashcard");
}

export async function generateFlashcards(data: {
  deck_id: string;
  topic?: string;
  text?: string;
  num_cards?: number;
  language?: string;
}) {
  const res = await fetch(`${API_BASE}/generate-flashcards`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...data,
      num_cards: data.num_cards ?? 10,
      language: data.language ?? "en",
    }),
  });

  if (!res.ok) throw new Error("Failed to generate flashcards");

  return res.json();
}

export async function generateFlashcardsBackground(data: {
  deck_id: string;
  topic?: string;
  text?: string;
  num_cards?: number;
  language?: string;
}) {
  const res = await fetch(`${API_BASE}/generate-flashcards/background`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...data,
      num_cards: data.num_cards ?? 10,
      language: data.language ?? "en",
    }),
  });

  if (!res.ok) throw new Error("Failed to start generation");
  return res.json() as Promise<{ deck_id: string; status: string }>;
}

export async function submitReview(
  flashcardId: string,
  rating: "again" | "hard" | "good" | "easy",
  userId: string
) {
  const res = await fetch(`${API_BASE}/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      flashcard_id: flashcardId,
      rating,
      user_id: userId,
    }),
  });

  if (!res.ok) throw new Error("Failed to submit review");

  return res.json();
}

export interface UserSettings {
  think_delay_enabled: boolean;
  think_delay_ms: number;
  card_style: "paper" | "minimal" | "modern" | "anki";
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const res = await fetch(`${API_BASE}/users/${userId}/settings`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch user settings");
  return res.json();
}

export async function updateUserSettings(
  userId: string,
  data: Partial<UserSettings>
): Promise<UserSettings> {
  const res = await fetch(`${API_BASE}/users/${userId}/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update user settings");
  return res.json();
}
