import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Edge-safe middleware — hanya pakai authConfig (tanpa Prisma/bcrypt).
export const { auth: middleware } = NextAuth(authConfig);

export default middleware((req) => {
  // Otorisasi tetap dicek di server (layout requireUser, requireCan/assertCan, Route Handler).
  // Middleware hanya menempelkan konteks request untuk log keamanan. Nilai dari klien selalu ditimpa.
  const headers = new Headers(req.headers);
  headers.set("x-request-id", crypto.randomUUID());
  headers.set("x-pathname", req.nextUrl.pathname.slice(0, 300));
  headers.set("x-method", req.method);
  return NextResponse.next({ request: { headers } });
});

export const config = {
  // api/log tanpa login: error di halaman login juga perlu tercatat.
  // api/security/waf dan api/security/cleanup diautentikasi dengan secret sendiri (bukan sesi).
  matcher: ["/((?!api/auth|api/log|api/security/waf|api/security/cleanup|_next/static|_next/image|favicon.ico|logo|track).*)"],
};
