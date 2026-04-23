/** `localStorage` key for the active flashcard user id; keep in sync with account selector. */
export const FLASHCARD_USER_ID_STORAGE_KEY = "flashcard_user_id";

export function getStoredUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(FLASHCARD_USER_ID_STORAGE_KEY);
}
