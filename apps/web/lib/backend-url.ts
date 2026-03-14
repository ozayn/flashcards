/**
 * Server-only: backend URL resolution for proxy and debug routes.
 * Prefers API_INTERNAL_URL (Railway private networking), falls back to NEXT_PUBLIC_API_URL.
 */

const DEFAULT_URL = "http://localhost:8080";

export function getBackendUrl(): string {
  const raw =
    (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL)
      ?.trim() || DEFAULT_URL;
  const url = raw.replace(/\/$/, "");
  // Fallback if URL is invalid (e.g. Railway variable reference failed)
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || url.includes("${{") || url.includes("}}")) {
      return process.env.NEXT_PUBLIC_API_URL?.trim()?.replace(/\/$/, "") || DEFAULT_URL;
    }
  } catch {
    return process.env.NEXT_PUBLIC_API_URL?.trim()?.replace(/\/$/, "") || DEFAULT_URL;
  }
  return url;
}

/** Which env var was used (for debug output). */
export function getBackendUrlSource(): string {
  const internal = process.env.API_INTERNAL_URL?.trim();
  const public_ = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (internal && !internal.includes("${{")) {
    try {
      const p = new URL(internal);
      if (p.hostname) return "API_INTERNAL_URL";
    } catch {
      /* invalid, fall through */
    }
  }
  return public_ ? "NEXT_PUBLIC_API_URL" : "default (localhost:8080)";
}
