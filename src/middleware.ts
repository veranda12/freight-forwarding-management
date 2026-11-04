import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-safe middleware — hanya pakai authConfig (tanpa Prisma/bcrypt).
export const { auth: middleware } = NextAuth(authConfig);

export default middleware((req) => {
  // authorized callback di authConfig menangani redirect ke /login.
  void req;
});

export const config = {
  // api/log tanpa login: error di halaman login juga perlu tercatat.
  matcher: ["/((?!api/auth|api/log|_next/static|_next/image|favicon.ico|logo|track).*)"],
};
