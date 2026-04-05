import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    backendUserId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    backendUserId?: string;
  }
}
