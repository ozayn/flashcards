/**
 * Server-only helpers for Google / NextAuth sign-in configuration.
 * Used by the sign-in page and optional diagnostics (no secret values exposed).
 */

export type GoogleSignInEnvPresence = {
  GOOGLE_CLIENT_ID: boolean;
  GOOGLE_CLIENT_SECRET: boolean;
  NEXTAUTH_SECRET: boolean;
  NEXTAUTH_URL: boolean;
  MEMO_OAUTH_SYNC_SECRET: boolean;
};

const REQUIRED_FOR_GOOGLE_BUTTON: (keyof GoogleSignInEnvPresence)[] = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "NEXTAUTH_SECRET",
  "MEMO_OAUTH_SYNC_SECRET",
];

function envNonEmpty(name: keyof GoogleSignInEnvPresence): boolean {
  const v = process.env[name]?.trim();
  return typeof v === "string" && v.length > 0;
}

/** Presence only (boolean per var); never reads or logs values. */
export function getGoogleSignInEnvPresence(): GoogleSignInEnvPresence {
  return {
    GOOGLE_CLIENT_ID: envNonEmpty("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: envNonEmpty("GOOGLE_CLIENT_SECRET"),
    NEXTAUTH_SECRET: envNonEmpty("NEXTAUTH_SECRET"),
    NEXTAUTH_URL: envNonEmpty("NEXTAUTH_URL"),
    MEMO_OAUTH_SYNC_SECRET: envNonEmpty("MEMO_OAUTH_SYNC_SECRET"),
  };
}

/**
 * Same rule as the sign-in page: all four must be set for the Google button.
 * (NextAuth also needs NEXTAUTH_SECRET at runtime; jwt callback needs MEMO_OAUTH_SYNC_SECRET.)
 */
export function isGoogleSignInEnabledOnServer(): boolean {
  const p = getGoogleSignInEnvPresence();
  return REQUIRED_FOR_GOOGLE_BUTTON.every((k) => p[k]);
}

export function missingRequiredGoogleSignInEnvKeys(
  p: GoogleSignInEnvPresence
): string[] {
  return REQUIRED_FOR_GOOGLE_BUTTON.filter((k) => !p[k]);
}

/**
 * When SIGNIN_GOOGLE_ENV_DEBUG=1, log one line with present=true/false per variable.
 * Safe for production: no values, only names and booleans.
 */
export function logGoogleSignInEnvDiagnosticsIfEnabled(): void {
  if (process.env.SIGNIN_GOOGLE_ENV_DEBUG?.trim() !== "1") return;
  const p = getGoogleSignInEnvPresence();
  const parts = (Object.keys(p) as (keyof GoogleSignInEnvPresence)[]).map(
    (k) => `${k}: present=${p[k]}`
  );
  console.info(`[signin-google-env] ${parts.join("; ")}`);
}
