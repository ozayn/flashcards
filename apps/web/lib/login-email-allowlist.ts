/**
 * ALLOWED_LOGIN_EMAILS: comma-separated; trim + lowercase comparison only.
 * Aligned with: apps/api/app/core/login_email_allowlist.py
 *
 * Not Gmail-normalized: entries and Google email are compared as trim + lowercase
 * only (dots in gmail.com local part and +tags are NOT folded). Use the exact
 * address string Google returns, lowercased, in the allowlist—or the same spelling
 * with different casing.
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

export type LoginAllowlistDenyReason =
  | "allowed"
  | "no_google_email"
  | "allowlist_empty"
  | "email_not_in_allowlist";

export type LoginAllowlistEvaluation = {
  /** Value compared against the allowlist (trim + lowercase), or null if no email. */
  comparedEmail: string | null;
  googleEmailPresent: boolean;
  allowlistEntryCount: number;
  allowed: boolean;
  denyReason: LoginAllowlistDenyReason;
};

/**
 * Server-only: uses process.env.ALLOWED_LOGIN_EMAILS.
 * Use for logging; same rules as isEmailAllowedForLogin.
 */
export function evaluateAllowedLoginEmail(
  email: string | null | undefined
): LoginAllowlistEvaluation {
  const allow = parseAllowedLoginEmails(process.env.ALLOWED_LOGIN_EMAILS);
  const raw = typeof email === "string" ? email : "";
  const compared = raw.trim() ? raw.trim().toLowerCase() : "";
  const googleEmailPresent = compared.length > 0;

  if (!googleEmailPresent) {
    return {
      comparedEmail: null,
      googleEmailPresent: false,
      allowlistEntryCount: allow.size,
      allowed: false,
      denyReason: "no_google_email",
    };
  }
  if (allow.size === 0) {
    return {
      comparedEmail: compared,
      googleEmailPresent: true,
      allowlistEntryCount: 0,
      allowed: false,
      denyReason: "allowlist_empty",
    };
  }
  if (!allow.has(compared)) {
    return {
      comparedEmail: compared,
      googleEmailPresent: true,
      allowlistEntryCount: allow.size,
      allowed: false,
      denyReason: "email_not_in_allowlist",
    };
  }
  return {
    comparedEmail: compared,
    googleEmailPresent: true,
    allowlistEntryCount: allow.size,
    allowed: true,
    denyReason: "allowed",
  };
}

/** Server-only: uses process.env.ALLOWED_LOGIN_EMAILS */
export function isEmailAllowedForLogin(email: string | null | undefined): boolean {
  return evaluateAllowedLoginEmail(email).allowed;
}

/**
 * Sorted allowlist entries as compared at runtime (trim + lowercase each segment).
 * For SIGNIN_ALLOWLIST_DEBUG / support — do not log in untrusted environments.
 */
export function listAllowedLoginEmailsNormalized(): string[] {
  return Array.from(
    parseAllowedLoginEmails(process.env.ALLOWED_LOGIN_EMAILS)
  ).sort();
}
