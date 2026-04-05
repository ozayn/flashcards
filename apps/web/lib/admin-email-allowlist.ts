/**
 * ADMIN_EMAILS: comma-separated; entries and candidates use normalizeEmailForIdentity.
 * Aligned with: apps/api/app/core/admin_email_allowlist.py
 */

import { normalizeEmailForIdentity } from "@/lib/email-identity";

export function parseAdminEmailAllowlist(envValue: string | undefined): Set<string> {
  const raw = (envValue ?? "").trim();
  if (!raw) return new Set();
  const out = new Set<string>();
  for (const part of raw.split(",")) {
    const s = part.trim();
    if (!s) continue;
    const norm = normalizeEmailForIdentity(s);
    if (norm) out.add(norm);
  }
  return out;
}

/** Server-only: reads process.env.ADMIN_EMAILS (no NEXT_PUBLIC_). */
export function isAdminEmailAllowlisted(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  const norm = normalizeEmailForIdentity(email);
  if (!norm) return false;
  const allow = parseAdminEmailAllowlist(process.env.ADMIN_EMAILS);
  return allow.has(norm);
}
