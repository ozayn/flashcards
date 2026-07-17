/**
 * Device-aware default read-aloud provider + explicit-choice persistence.
 *
 * - No explicit choice → infer: macOS desktop → browser; mobile/PWA → openai (admins only).
 * - Explicit saved choice → respect it (subject to product-admin authorization).
 * - Non-admins always use browser (even if a stale `openai` value is stored).
 */

import type { ReadAloudProvider } from "@/lib/openai-tts-config";
import { normalizeReadAloudProvider } from "@/lib/openai-tts-config";

const EXPLICIT_KEY_PREFIX = "flashcard_read_aloud_provider_explicit_v1:";

function explicitStorageKey(userId: string): string {
  return `${EXPLICIT_KEY_PREFIX}${userId}`;
}

export function hasExplicitReadAloudProviderChoice(userId: string | null | undefined): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    return localStorage.getItem(explicitStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markExplicitReadAloudProviderChoice(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(explicitStorageKey(userId), "1");
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Cautious device heuristic — prefers platform signals over viewport width.
 * macOS desktop/laptop → browser. iPhone/Android/mobile PWA → openai candidate.
 */
export function preferOpenAiReadAloudByDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = (navigator.platform || "").toLowerCase();
  const maxTouch = typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;

  // Phones / tablets (incl. installed mobile PWAs).
  if (/iphone|ipod|android.+mobile|windows phone/i.test(ua)) return true;
  if (/ipad|android(?!.+mobile)|tablet/i.test(ua)) return true;
  // iPadOS 13+ may report as Mac with touch.
  if (/macintosh/i.test(ua) && maxTouch > 1) return true;

  // Explicit desktop macOS → browser.
  if (/mac/i.test(platform) || /macintosh|mac os x/i.test(ua)) return false;

  // Other desktops (Windows/Linux Chrome) → browser.
  if (/win|linux|cros/i.test(platform)) return false;

  return false;
}

export type ResolveReadAloudProviderArgs = {
  saved: string | null | undefined;
  userId: string | null | undefined;
  isProductAdmin: boolean;
  /** When false, OpenAI is misconfigured server-side — never default to it. */
  openaiConfigured?: boolean;
};

/**
 * Effective provider for playback and Profile UI selection state.
 */
export function resolveReadAloudProvider({
  saved,
  userId,
  isProductAdmin,
  openaiConfigured = true,
}: ResolveReadAloudProviderArgs): ReadAloudProvider {
  if (!isProductAdmin || !openaiConfigured) {
    return "browser";
  }

  if (hasExplicitReadAloudProviderChoice(userId)) {
    return normalizeReadAloudProvider(saved);
  }

  // Never explicitly chosen: device-aware default for product admins.
  if (preferOpenAiReadAloudByDevice()) return "openai";
  return "browser";
}
