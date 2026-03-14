import { NextResponse } from "next/server";
import { getBackendUrl, getBackendUrlSource } from "@/lib/backend-url";

/**
 * Temporary debug route for testing Railway private networking.
 * Server-side only: fetches backend /health. Uses API_INTERNAL_URL when valid.
 * Remove or protect in production.
 */
export async function GET() {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl.replace(/\/$/, "")}/health`;
  const source = getBackendUrlSource();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const body = await res.json().catch(() => ({}));

    return NextResponse.json({
      ok: res.ok,
      backendReachable: true,
      status: res.status,
      backendResponse: body,
      source,
      message: res.ok
        ? (source === "API_INTERNAL_URL"
            ? "Backend reachable via private networking"
            : `Backend reachable via ${source}`)
        : `Backend returned ${res.status}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes("abort") || message.includes("timeout");

    // Redacted URL hint for debugging (hostname masked, port visible)
    let urlHint: string | undefined;
    try {
      const u = new URL(url);
      urlHint = `${u.protocol}//***:${u.port || "(default)"}`;
      if (backendUrl.includes("${{") || backendUrl.includes("}}")) {
        urlHint += " (variable may not have resolved - check service name)";
      }
    } catch {
      urlHint = backendUrl.includes("${{") ? "Variable reference may be invalid" : undefined;
    }

    return NextResponse.json(
      {
        ok: false,
        backendReachable: false,
        source,
        urlHint,
        error: isTimeout ? "Request timed out" : message,
        message:
          "Backend unreachable. Check API_INTERNAL_URL and Railway private networking.",
      },
      { status: 503 }
    );
  }
}
