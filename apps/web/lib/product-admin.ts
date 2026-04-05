/**
 * Client-side product admin rule. Keep aligned with API:
 * `apps/api/app/core/product_admin.py` (`user_has_product_admin_access`).
 *
 * Elevated if: role === "admin", or display name is "Azin" (case-insensitive), or
 * email is in NEXT_PUBLIC_PRODUCT_ADMIN_EMAILS (comma-separated; optional).
 */

const PRODUCT_ADMIN_EMAILS = new Set(
  (process.env.NEXT_PUBLIC_PRODUCT_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export function userIsProductAdmin(profile: {
  role: string;
  name: string;
  email?: string;
}): boolean {
  if ((profile.role || "").trim() === "admin") return true;
  if ((profile.name || "").trim().toLowerCase() === "azin") return true;
  const em = (profile.email || "").trim().toLowerCase();
  if (em && PRODUCT_ADMIN_EMAILS.has(em)) return true;
  return false;
}
