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
  // Add protocol if missing (e.g. NEXT_PUBLIC_API_URL=api.example.com)
  if (url && !/^https?:\/\//i.test(url)) {
    url = url.startsWith("localhost") || url.includes(".railway.internal")
      ? `http://${url}`
      : `https://${url}`;
  }
  // Fallback if URL is invalid (e.g. Railway variable reference failed)
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || url.includes("${{") || url.includes("}}")) {
      const fallback = process.env.NEXT_PUBLIC_API_URL?.trim()?.replace(/\/$/, "") || DEFAULT_URL;
      return /^https?:\/\//i.test(fallback) ? fallback : `https://${fallback}`;
    }
    // Private networking (.railway.internal) must use http
    if (parsed.hostname.endsWith(".railway.internal") && parsed.protocol === "https:") {
      url = url.replace(/^https:\/\//, "http://");
    }
    // .railway.internal without port defaults to 8080 (backend listen port)
    if (parsed.hostname.endsWith(".railway.internal") && (!parsed.port || parsed.port === "80")) {
      url = `${parsed.protocol}//${parsed.hostname}:8080`;
    }
  } catch {
    const fallback = process.env.NEXT_PUBLIC_API_URL?.trim()?.replace(/\/$/, "") || DEFAULT_URL;
    return /^https?:\/\//i.test(fallback) ? fallback : `https://${fallback}`;
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
  /** Temporary: diagnose why API_INTERNAL_URL may not be available at runtime */
  envDiagnostics: {
    exists: boolean;
    isEmpty: boolean;
    startsWithHttp: boolean;
    rawType: string;
    rawLength: number;
  };
} {
  const raw = process.env.API_INTERNAL_URL;
  const internal = raw?.trim();
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
    envDiagnostics: {
      exists: typeof raw !== "undefined",
      isEmpty: raw === undefined || raw === null || String(raw).trim() === "",
      startsWithHttp: typeof raw === "string" && raw.trim().toLowerCase().startsWith("http://"),
      rawType: typeof raw,
      rawLength: typeof raw === "string" ? raw.length : 0,
    },
  };
}
