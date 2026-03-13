import { NextResponse } from "next/server";

/**
 * Temporary debug route for testing Railway private networking.
 * Server-side only: fetches backend /health via API_INTERNAL_URL.
 * Remove or protect in production.
 */
export async function GET() {
  const backendUrl =
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8000";
  const url = `${backendUrl.replace(/\/$/, "")}/health`;

  // Redact URL for response (hide internal hostname, show which env was used)
  const source = process.env.API_INTERNAL_URL
    ? "API_INTERNAL_URL"
    : process.env.NEXT_PUBLIC_API_URL
      ? "NEXT_PUBLIC_API_URL"
      : "default (localhost:8000)";

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
        ? "Backend reachable via private networking"
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
