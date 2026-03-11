/** Base API URL, normalized (no trailing slash) to avoid double slashes. */
export const apiUrl =
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const API_URL = apiUrl;

export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_URL}${endpoint}`;
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

export async function healthCheck(): Promise<{ status: string }> {
  return fetchApi<{ status: string }>("/health");
}

export async function getUsers() {
  const res = await fetch(`${apiUrl}/users`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

export async function getDecks(userId: string, archived = false) {
  const res = await fetch(
    `${apiUrl}/decks?user_id=${userId}&archived=${archived}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to fetch decks");
  return res.json();
}

export async function getDeck(deckId: string) {
  const res = await fetch(`${apiUrl}/decks/${deckId}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch deck");
  return res.json();
}

export async function createDeck(data: {
  user_id: string;
  name: string;
  description?: string;
}) {
  const res = await fetch(`${apiUrl}/decks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...data,
      source_type: "topic",
    }),
  });

  if (!res.ok) throw new Error("Failed to create deck");

  return res.json();
}

export async function updateDeck(
  deckId: string,
  data: { name?: string; description?: string; archived?: boolean }
) {
  const res = await fetch(`${apiUrl}/decks/${deckId}`, {
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
  const res = await fetch(`${apiUrl}/decks/${deckId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete deck");
}

export async function getFlashcards(deckId: string) {
  const res = await fetch(`${apiUrl}/decks/${deckId}/flashcards`, { cache: "no-store" });
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
  const res = await fetch(`${apiUrl}/flashcards`, {
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
  const res = await fetch(`${apiUrl}/flashcards/${flashcardId}`, {
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
  const res = await fetch(`${apiUrl}/flashcards/${flashcardId}`, {
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
  const res = await fetch(`${apiUrl}/flashcards/${flashcardId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete flashcard");
}

export async function generateFlashcards(data: {
  deck_id: string;
  topic: string;
  num_cards?: number;
}) {
  const res = await fetch(`${apiUrl}/generate-flashcards`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...data,
      num_cards: data.num_cards ?? 5,
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
  const res = await fetch(`${apiUrl}/reviews`, {
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
