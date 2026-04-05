import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/** Wall-clock session length for the signed token (tab session uses sessionStorage separately). */
const TOKEN_TTL_SEC = 12 * 3600;

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_PAGE_PASSWORD;
  if (!secret) {
    return NextResponse.json(
      { detail: "Admin password is not configured on the server" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid request" }, { status: 400 });
  }

  const password =
    typeof body === "object" &&
    body !== null &&
    "password" in body &&
    typeof (body as { password: unknown }).password === "string"
      ? (body as { password: string }).password
      : "";

  const a = Buffer.from(password, "utf8");
  const b = Buffer.from(secret, "utf8");
  const ok =
    a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) {
    return NextResponse.json(
      { detail: "Incorrect password" },
      { status: 401 }
    );
  }

  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const payloadJson = JSON.stringify({ exp });
  const payloadB64 = Buffer.from(payloadJson, "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payloadB64, "utf8")
    .digest("hex");
  const token = `${payloadB64}.${sig}`;

  return NextResponse.json({ token });
}
