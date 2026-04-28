/**
 * Stripe Payment Link (or similar) for optional project support.
 * Must be NEXT_PUBLIC_* so the URL is available in client bundles.
 */
export function getMemoNextSupportUrl(): string | null {
  const u = process.env.NEXT_PUBLIC_MEMONEXT_SUPPORT_URL?.trim();
  return u || null;
}
