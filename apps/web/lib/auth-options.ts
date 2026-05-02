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
          console.error("[auth] oauth/google sync skipped: MEMO_OAUTH_SYNC_SECRET is not set");
          throw new Error("Server configuration error");
        }

        const u = user as { email?: string | null } | undefined;
        const oauthEmail =
          (typeof u?.email === "string" && u.email.trim()) ||
          (typeof prof?.email === "string" && prof.email.trim()) ||
          (typeof token.email === "string" && token.email.trim()) ||
          undefined;

        if (!oauthEmail) {
          console.error(
            "[auth] oauth/google sync aborted: no email on user/profile/token (first jwt after Google). user.email=%s profile.email=%s token.email=%s",
            u?.email ?? "(absent)",
            prof?.email ?? "(absent)",
            token.email ?? "(absent)"
          );
          throw new Error("OAUTH_SYNC_MISSING_EMAIL");
        }

        const backendUrl = getBackendUrl();
        let res: Response;
        try {
          res = await fetch(`${backendUrl}/users/oauth/google`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Memo-OAuth-Secret": syncSecret,
            },
            body: JSON.stringify({
              google_sub: account.providerAccountId,
              email: oauthEmail,
              name: (prof?.name ?? token.name ?? "Google user").trim() || "Google user",
              picture: nextPicture || undefined,
            }),
          });
        } catch (e) {
          console.error(
            "[auth] oauth/google sync network error",
            { backendUrl, message: e instanceof Error ? e.message : String(e) }
          );
          throw new Error("OAUTH_SYNC_NETWORK");
        }

        if (!res.ok) {
          const raw = await res.text();
          let detailSnippet = raw.slice(0, 500);
          try {
            const j = JSON.parse(raw) as { detail?: unknown };
            if (typeof j.detail === "string") detailSnippet = j.detail;
          } catch {
            /* keep raw */
          }
          if (res.status === 403) {
            console.error("[auth] oauth/google sync denied (403 allowlist or policy)", {
              detailSnippet,
              comparedEmail: oauthEmail,
            });
            throw new Error("LOGIN_NOT_ALLOWED");
          }
          if (res.status === 401) {
            console.error("[auth] oauth/google sync unauthorized (401)", {
              detailSnippet,
              hint: "MEMO_OAUTH_SYNC_SECRET mismatch between Next.js server and API, or secret unset on API",
            });
            throw new Error("OAUTH_SYNC_SECRET_MISMATCH");
          }
          if (res.status === 400) {
            console.error("[auth] oauth/google sync rejected (400)", { detailSnippet });
            throw new Error("OAUTH_SYNC_BAD_REQUEST");
          }
          console.error("[auth] oauth/google sync failed", {
            status: res.status,
            detailSnippet,
          });
          throw new Error("OAUTH_SYNC_SERVER_ERROR");
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
