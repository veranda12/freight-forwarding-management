import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-safe middleware — hanya pakai authConfig (tanpa Prisma/bcrypt).
export const { auth: middleware } = NextAuth(authConfig);

export default middleware((req) => {
  // authorized callback di authConfig menangani redirect ke /login.
  void req;
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|logo|track).*)"],
};
