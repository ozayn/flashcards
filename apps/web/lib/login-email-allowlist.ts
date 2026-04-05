/**
 * ALLOWED_LOGIN_EMAILS: comma-separated; trim + lowercase comparison only.
 * Aligned with: apps/api/app/core/login_email_allowlist.py
 */

export function parseAllowedLoginEmails(envValue: string | undefined): Set<string> {
  const raw = (envValue ?? "").trim();
  if (!raw) return new Set();
  const out = new Set<string>();
  for (const part of raw.split(",")) {
    const s = part.trim().toLowerCase();
    if (s) out.add(s);
  }
  return out;
}

/** Server-only: uses process.env.ALLOWED_LOGIN_EMAILS */
export function isEmailAllowedForLogin(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  const allow = parseAllowedLoginEmails(process.env.ALLOWED_LOGIN_EMAILS);
  if (allow.size === 0) return false;
  return allow.has(email.trim().toLowerCase());
}
