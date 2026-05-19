import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { isAdminEmailAllowlisted } from "@/lib/admin-email-allowlist";
import { AdminSubnav } from "../admin-subnav";
import { AdminNotAuthorizedPanel } from "../not-authorized-panel";
import { AdminNoSessionEmailPanel } from "../no-session-email-panel";
import { AdminLibraryCollectionsClient } from "./client";

/**
 * Server-rendered admin page for managing curated library collections.
 *
 * Mirrors the gating pattern of /admin (the Users page): redirect signed-out users to
 * the sign-in flow, show a friendly panel for signed-in non-admins, and only mount the
 * client surface for allowlisted admins.
 */
export default async function AdminLibraryCollectionsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/signin?callbackUrl=%2Fadmin%2Flibrary-collections");
  }

  const email = session.user?.email?.trim();
  if (!email) {
    return <AdminNoSessionEmailPanel />;
  }

  if (!isAdminEmailAllowlisted(email)) {
    return <AdminNotAuthorizedPanel />;
  }

  return (
    <>
      <AdminSubnav active="library-collections" />
      <AdminLibraryCollectionsClient />
    </>
  );
}
