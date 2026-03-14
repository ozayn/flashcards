import { NextRequest, NextResponse } from "next/server";

/** Server-only: use Railway private networking when available. */
const getBackendUrl = (): string => {
  const raw =
    process.env.API_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://localhost:8000";
  const url = raw.replace(/\/$/, "");
  // Fallback if URL is invalid (e.g. Railway variable reference failed)
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return process.env.NEXT_PUBLIC_API_URL?.trim()?.replace(/\/$/, "") || "http://localhost:8000";
  } catch {
    return process.env.NEXT_PUBLIC_API_URL?.trim()?.replace(/\/$/, "") || "http://localhost:8000";
  }
  return url;
};

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

  try {
    const res = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
    });

    const resBody = await res.text();
    const responseHeaders = new Headers();
    const contentType = res.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);
    return new NextResponse(resBody, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("Proxy error:", err);
    return NextResponse.json(
      { detail: "Backend unavailable" },
      { status: 503 }
    );
  }
}
