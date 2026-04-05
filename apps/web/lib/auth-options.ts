import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getBackendUrl } from "@/lib/backend-url";

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
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === "google" && account.providerAccountId) {
        const syncSecret = process.env.MEMO_OAUTH_SYNC_SECRET?.trim();
        if (!syncSecret) {
          console.error("[auth] MEMO_OAUTH_SYNC_SECRET is not set");
          throw new Error("Server configuration error");
        }
        const prof = profile as { email?: string | null; name?: string | null } | undefined;
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
          }),
        });
        if (!res.ok) {
          const detail = await res.text();
          console.error("[auth] Google user sync failed", res.status, detail);
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
      return session;
    },
  },
};
