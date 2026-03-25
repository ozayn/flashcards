import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend-url";

const PROXY_TIMEOUT_MS = 15_000;

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
    if (
      key.toLowerCase() !== "host" &&
      key.toLowerCase() !== "connection"
    ) {
      headers.set(key, value);
    }
  });

  let body: string | undefined;
  if (["POST", "PATCH", "PUT"].includes(request.method)) {
    body = await request.text();
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

    const resBody = await res.text();
    const responseHeaders = new Headers();
    const contentType = res.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);
    const responseBody = (res.status === 204 || res.status === 304) ? null : resBody;
    return new NextResponse(responseBody, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
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
