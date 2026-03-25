import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend-url";

export async function GET() {
  const backendUrl = getBackendUrl();
  let backendOk = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${backendUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    backendOk = res.ok;
  } catch {
    backendOk = false;
  }

  return NextResponse.json({
    status: "healthy",
    service: "flashcard-web",
    backend: backendOk ? "reachable" : "unavailable",
  });
}
