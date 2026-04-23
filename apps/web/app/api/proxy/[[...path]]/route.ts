import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { getBackendUrl } from "@/lib/backend-url";

const PROXY_TIMEOUT_MS = 90_000;

/** Never forward client-supplied values; the proxy sets these from the NextAuth session. */
const STRIP_FROM_CLIENT = new Set([
  "x-memo-acting-user-id",
  "x-memo-acting-user-signature",
  "x-admin-page-token",
]);

// Rate-limit error logging: at most once per 10 seconds
let lastErrorLogMs = 0;
const ERROR_LOG_INTERVAL_MS = 10_000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, await params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, await params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, await params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, await params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, await params);
}

async function proxy(
  request: NextRequest,
  { path = [] }: { path?: string[] }
) {
  const backendUrl = getBackendUrl();
  const pathStr = path.length > 0 ? path.join("/") : "";
  const search = request.nextUrl.search;
  const targetUrl = `${backendUrl}/${pathStr}${search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection") return;
    if (STRIP_FROM_CLIENT.has(lower)) return;
    headers.set(key, value);
  });

  const session = await getServerSession(authOptions);
  const bid = session?.backendUserId;
  const secret = process.env.MEMO_OAUTH_SYNC_SECRET?.trim();
  if (typeof bid === "string" && bid.length > 0 && secret) {
    const sig = createHmac("sha256", secret).update(bid).digest("hex");
    headers.set("X-Memo-Acting-User-Id", bid);
    headers.set("X-Memo-Acting-User-Signature", sig);
  }

  let body: BodyInit | undefined;
  if (["POST", "PATCH", "PUT"].includes(request.method)) {
    const buf = await request.arrayBuffer();
    body = buf.byteLength > 0 ? buf : undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const res = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.status === 204 || res.status === 304) {
      const responseHeaders = new Headers();
      for (const name of [
        "content-type",
        "content-disposition",
        "cache-control",
        "etag",
      ] as const) {
        const v = res.headers.get(name);
        if (v) responseHeaders.set(name, v);
      }
      return new NextResponse(null, {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
      });
    }

    const resBuf = await res.arrayBuffer();
    const responseHeaders = new Headers();
    for (const name of [
      "content-type",
      "content-disposition",
      "cache-control",
      "etag",
    ] as const) {
      const v = res.headers.get(name);
      if (v) responseHeaders.set(name, v);
    }
    return new NextResponse(
      resBuf.byteLength > 0 ? resBuf : new ArrayBuffer(0),
      {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
      }
    );
  } catch (err) {
    clearTimeout(timeout);

    const now = Date.now();
    if (now - lastErrorLogMs >= ERROR_LOG_INTERVAL_MS) {
      lastErrorLogMs = now;
      let urlHint = "unknown";
      try {
        const u = new URL(targetUrl);
        urlHint = `${u.protocol}//${u.hostname}:${u.port || "(default)"}`;
      } catch {
        urlHint = targetUrl.slice(0, 50);
      }
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = controller.signal.aborted;
      console.error(
        `Proxy error: ${isTimeout ? "timeout" : msg} | target: ${urlHint} | ${request.method} /${pathStr}`
      );
    }

    const retryAfter = controller.signal.aborted ? "5" : "3";
    return NextResponse.json(
      { detail: "Backend unavailable", retry: true },
      {
        status: 503,
        headers: { "Retry-After": retryAfter },
      }
    );
  }
}
