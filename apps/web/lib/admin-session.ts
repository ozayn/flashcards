/** sessionStorage key for HMAC admin session token (verified by API). */
export const ADMIN_SESSION_TOKEN_KEY = "flashcards_admin_page_token";

export function getAdminSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ADMIN_SESSION_TOKEN_KEY);
}

export function setAdminSessionToken(token: string): void {
  sessionStorage.setItem(ADMIN_SESSION_TOKEN_KEY, token);
}

export function clearAdminSessionToken(): void {
  sessionStorage.removeItem(ADMIN_SESSION_TOKEN_KEY);
}
