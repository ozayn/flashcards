import { createHmac } from "crypto";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { getBackendUrl } from "@/lib/backend-url";

/**
 * Server-side fetch to the FastAPI backend with the same acting-user headers as
 * `/api/proxy`. Use in RSC/layout metadata instead of unauthenticated direct calls.
 */
export async function serverFetchBackend(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const normalized = path.replace(/^\//, "");
  const headers = new Headers(init?.headers);
  const session = await getServerSession(authOptions);
  const bid = session?.backendUserId;
  const secret = process.env.MEMO_OAUTH_SYNC_SECRET?.trim();
  if (typeof bid === "string" && bid.length > 0 && secret) {
    const sig = createHmac("sha256", secret).update(bid).digest("hex");
    headers.set("X-Memo-Acting-User-Id", bid);
    headers.set("X-Memo-Acting-User-Signature", sig);
  }
  return fetch(`${getBackendUrl()}/${normalized}`, { ...init, headers });
}
