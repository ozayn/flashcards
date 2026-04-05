import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    backendUserId?: string;
    /** True when session email is in ADMIN_EMAILS (same rule as /admin API). */
    isPlatformAdmin?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    backendUserId?: string;
    picture?: string;
  }
}
