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
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API_BASE}/decks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, source_type: data.source_type ?? "topic" }),
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
  data: { name?: string; description?: string; archived?: boolean; category_id?: string | null }
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
