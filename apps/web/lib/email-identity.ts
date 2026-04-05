/**
 * Canonical email for identity matching (admin allowlist, session vs env).
 * Gmail / Googlemail: +tag stripped, dots removed in local part, googlemail.com → gmail.com.
 * Other domains: trim + lowercase only.
 *
 * Keep in sync with: apps/api/app/core/email_identity.py
 */

export function normalizeEmailForIdentity(email: string | null | undefined): string {
  if (!email || typeof email !== "string") return "";
  const s = email.trim().toLowerCase();
  if (!s || !s.includes("@")) return s;
  const at = s.lastIndexOf("@");
  const local = s.slice(0, at);
  const domain = s.slice(at + 1).trim().toLowerCase();
  if (!local) return s;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const plusIdx = local.indexOf("+");
    const localBase = plusIdx === -1 ? local : local.slice(0, plusIdx);
    const localNorm = localBase.replace(/\./g, "");
    if (!localNorm) return s;
    return `${localNorm}@gmail.com`;
  }
  return `${local}@${domain}`;
}
