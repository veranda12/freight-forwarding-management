import type { DefaultSession } from "next-auth";

// Token login hanya menyimpan id user. Role & izin dibaca dari DB setiap request (lib/auth-helpers.ts).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
  }
}
