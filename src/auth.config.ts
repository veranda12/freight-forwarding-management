import type { NextAuthConfig } from "next-auth";

/**
 * Konfigurasi dasar Auth.js yang edge-safe (tanpa Prisma/bcrypt).
 * Dipakai oleh middleware dan di-extend di src/auth.ts.
 */
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const path = nextUrl.pathname;
      const isPublic =
        path === "/login" ||
        path.startsWith("/track") ||
        path.startsWith("/api/auth") ||
        path === "/";
      if (isPublic) return true;
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
