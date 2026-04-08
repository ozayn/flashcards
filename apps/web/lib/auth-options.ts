import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getBackendUrl } from "@/lib/backend-url";
import { isAdminEmailAllowlisted } from "@/lib/admin-email-allowlist";
import {
  evaluateAllowedLoginEmail,
  listAllowedLoginEmailsNormalized,
} from "@/lib/login-email-allowlist";

function googleProviders() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!id || !secret) return [];
  return [
    GoogleProvider({
      clientId: id,
      clientSecret: secret,
    }),
  ];
}

export const authOptions: NextAuthOptions = {
  providers: googleProviders(),
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider !== "google") {
        return true;
      }
      const prof = profile as { email?: string | null } | undefined;
      const email =
        (typeof user?.email === "string" ? user.email : null) ??
        prof?.email ??
        null;
      const ev = evaluateAllowedLoginEmail(email);
      const allowlistDebug = process.env.SIGNIN_ALLOWLIST_DEBUG?.trim() === "1";

      if (allowlistDebug) {
        console.info(
          "[auth][google-allowlist-debug]",
          JSON.stringify({
            googleEmailPresent: ev.googleEmailPresent,
            comparedEmail: ev.comparedEmail,
            allowlistEntryCount: ev.allowlistEntryCount,
            allowlistEntriesNormalized: listAllowedLoginEmailsNormalized(),
            matchedAllowlist: ev.allowed,
            denyReason: ev.denyReason,
          })
        );
      }

      if (!ev.allowed) {
        const hint =
          ev.denyReason === "no_google_email"
            ? "No email on Google user/profile (NextAuth signIn callback)."
            : ev.denyReason === "allowlist_empty"
              ? "ALLOWED_LOGIN_EMAILS is empty or unset on the web server."
              : "Email not in ALLOWED_LOGIN_EMAILS (comma-separated list; trim + lowercase exact match per entry; Gmail dots and +tags are not normalized).";
        console.warn(
          `[auth] Google sign-in AccessDenied (signIn returned false → NextAuth error=AccessDenied): ${hint}`,
          JSON.stringify({
            denyReason: ev.denyReason,
            comparedEmail: ev.comparedEmail,
            allowlistEntryCount: ev.allowlistEntryCount,
            hintEnv:
              "Allowlist is read from the Next.js process: ALLOWED_LOGIN_EMAILS in apps/web/.env.local (not only apps/api/.env). Restart next dev after edits.",
          })
        );
        return false;
      }
      return true;
    },
    async jwt({ token, account, profile, user }) {
      const prof = profile as {
        email?: string | null;
        name?: string | null;
        picture?: string | null;
      } | undefined;
      const fromProfile = prof?.picture?.trim();
      const fromUser =
        user && "image" in user && typeof user.image === "string"
          ? user.image.trim()
          : "";
      const nextPicture = fromProfile || fromUser;
      if (nextPicture) {
        token.picture = nextPicture;
      }
      if (account?.provider === "google" && account.providerAccountId) {
        const syncSecret = process.env.MEMO_OAUTH_SYNC_SECRET?.trim();
        if (!syncSecret) {
          console.error("[auth] MEMO_OAUTH_SYNC_SECRET is not set");
          throw new Error("Server configuration error");
        }
        const res = await fetch(`${getBackendUrl()}/users/oauth/google`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Memo-OAuth-Secret": syncSecret,
          },
          body: JSON.stringify({
            google_sub: account.providerAccountId,
            email: prof?.email ?? token.email ?? undefined,
            name: (prof?.name ?? token.name ?? "Google user").trim() || "Google user",
            picture: nextPicture || undefined,
          }),
        });
        if (!res.ok) {
          const detail = await res.text();
          console.error("[auth] Google user sync failed", res.status, detail);
          if (res.status === 403) {
            throw new Error("LOGIN_NOT_ALLOWED");
          }
          throw new Error("Could not link your Google account to the app.");
        }
        const row = (await res.json()) as { id: string };
        token.backendUserId = row.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.backendUserId) {
        session.backendUserId = token.backendUserId as string;
      }
      if (token.picture && session.user) {
        session.user.image = token.picture as string;
      }
      const email = session.user?.email?.trim();
      session.isPlatformAdmin = Boolean(email && isAdminEmailAllowlisted(email));
      return session;
    },
  },
};
