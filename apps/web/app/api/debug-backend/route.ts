import { NextResponse } from "next/server";
import {
  getBackendUrl,
  getBackendUrlSource,
  getBackendUrlDebugInfo,
} from "@/lib/backend-url";

/**
 * Debug route for Railway private networking. Hidden in production (404).
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }
  const backendUrl = getBackendUrl();
  const url = `${backendUrl.replace(/\/$/, "")}/health`;
  const source = getBackendUrlSource();
  const debug = getBackendUrlDebugInfo();

  // Base response: always server-side, always report debug info
  const basePayload = {
    serverSide: true,
    debug: {
      apiInternalUrlPresent: debug.apiInternalUrlPresent,
      apiInternalUrlLength: debug.apiInternalUrlLength,
      apiInternalUrlUnresolved: debug.apiInternalUrlUnresolved,
      hostname: debug.hostname,
      port: debug.port,
      protocol: debug.protocol,
      resolvedUrlRedacted: `${debug.protocol}://${debug.hostname}:${debug.port}/health`,
      /** Diagnose API_INTERNAL_URL: exists=set in env, isEmpty=blank, startsWithHttp=valid format */
      envDiagnostics: debug.envDiagnostics,
    },
    source,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const body = await res.json().catch(() => ({}));

    return NextResponse.json({
      ...basePayload,
      ok: res.ok,
      backendReachable: true,
      status: res.status,
      backendResponse: body,
      message: res.ok
        ? source === "API_INTERNAL_URL"
          ? "Backend reachable via private networking"
          : `Backend reachable via ${source}`
        : `Backend returned ${res.status}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes("abort") || message.includes("timeout");
    const isDns = message.includes("ENOTFOUND") || message.includes("getaddrinfo");
    const isConnRefused = message.includes("ECONNREFUSED");

    let failureReason: string;
    if (debug.apiInternalUrlUnresolved) {
      failureReason =
        "API_INTERNAL_URL contains unresolved Railway variable (${{...}}). Use exact backend service name, e.g. ${{api.RAILWAY_PRIVATE_DOMAIN}}.";
    } else if (!debug.apiInternalUrlPresent) {
      failureReason =
        "API_INTERNAL_URL not set on web service. Add it in Railway Variables.";
    } else if (isTimeout) {
      failureReason =
        "Request timed out. Backend may not be listening on IPv6 (::). Check backend binds to :: for Railway private networking.";
    } else if (isDns) {
      failureReason =
        "DNS resolution failed for .railway.internal hostname. Verify backend service name in API_INTERNAL_URL matches Railway dashboard.";
    } else if (isConnRefused) {
      failureReason =
        "Connection refused. Backend may not be listening on port 8080 or may bind only to 0.0.0.0 (IPv4). Use --host :: for private networking.";
    } else {
      failureReason = message;
    }

    return NextResponse.json(
      {
        ...basePayload,
        ok: false,
        backendReachable: false,
        error: isTimeout ? "Request timed out" : message,
        failureReason,
        message: "Backend unreachable. See failureReason for exact cause.",
      },
      { status: 503 }
    );
  }
}
