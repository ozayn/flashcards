/**
 * Server-only: backend URL resolution for proxy and debug routes.
 * Prefers API_INTERNAL_URL (Railway private networking), falls back to NEXT_PUBLIC_API_URL.
 * Private networking requires http (not https) and backend service name in variable reference.
 */

const DEFAULT_URL = "http://localhost:8080";

export function getBackendUrl(): string {
  const raw =
    (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL)
      ?.trim() || DEFAULT_URL;
  let url = raw.replace(/\/$/, "");
  // Fallback if URL is invalid (e.g. Railway variable reference failed)
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || url.includes("${{") || url.includes("}}")) {
      return process.env.NEXT_PUBLIC_API_URL?.trim()?.replace(/\/$/, "") || DEFAULT_URL;
    }
    // Private networking (.railway.internal) must use http
    if (parsed.hostname.endsWith(".railway.internal") && parsed.protocol === "https:") {
      url = url.replace(/^https:\/\//, "http://");
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

/** Debug info for private networking troubleshooting. */
export function getBackendUrlDebugInfo(): {
  apiInternalUrlPresent: boolean;
  apiInternalUrlLength: number;
  apiInternalUrlUnresolved: boolean;
  hostname: string;
  port: string;
  protocol: string;
  resolvedUrl: string;
} {
  const internal = process.env.API_INTERNAL_URL?.trim();
  const url = getBackendUrl();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    parsed = new URL(DEFAULT_URL);
  }
  return {
    apiInternalUrlPresent: !!internal,
    apiInternalUrlLength: internal?.length ?? 0,
    apiInternalUrlUnresolved: !!(internal && (internal.includes("${{") || internal.includes("}}"))),
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === "https:" ? "443" : "80"),
    protocol: parsed.protocol.replace(":", ""),
    resolvedUrl: url,
  };
}
