import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { isAdminEmailAllowlisted } from "@/lib/admin-email-allowlist";
import { AdminUsersClient } from "./admin-users-client";
import { AdminNotAuthorizedPanel } from "./not-authorized-panel";
import { AdminNoSessionEmailPanel } from "./no-session-email-panel";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/signin?callbackUrl=%2Fadmin");
  }

  const email = session.user?.email?.trim();
  if (!email) {
    return <AdminNoSessionEmailPanel />;
  }

  if (!isAdminEmailAllowlisted(email)) {
    return <AdminNotAuthorizedPanel />;
  }

  return <AdminUsersClient />;
}
