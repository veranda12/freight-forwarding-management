import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { contextFromHeaders, currentContext } from "@/lib/security/context";
import { inspectLoginInput, loginBlocked, onLoginFailed, onLoginSuccess } from "@/lib/security/login-monitor";
import { recordSecurityEvent } from "@/lib/security/events";

const credsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

/** Login dibatasi sementara (rate limit). Pesan ke user tetap generik, tidak menyebut akun terdaftar atau tidak. */
export class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

// Hash dummy agar waktu proses akun tidak terdaftar mirip akun terdaftar (bcrypt tetap dijalankan).
let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("tidak-dipakai-untuk-login", 10));

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  events: {
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      const userId = typeof token?.id === "string" ? token.id : null;
      if (userId) await recordSecurityEvent({ type: "LOGOUT", userId, ctx: await currentContext({ path: "/logout" }) });
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // Semua pengecekan di server. Login dari form (Server Action) maupun POST langsung ke
      // /api/auth/callback/credentials sama-sama lewat sini, jadi rate limit dan log tidak bisa dilewati.
      async authorize(raw, request) {
        const ctx = contextFromHeaders(request.headers, { method: "POST", path: "/login" });
        const account = typeof raw?.email === "string" ? raw.email.slice(0, 254) : "";
        await inspectLoginInput(account, ctx);
        if (await loginBlocked(account, ctx)) throw new RateLimitedSignin();

        const parsed = credsSchema.safeParse(raw);
        if (!parsed.success) {
          await onLoginFailed(account, ctx, "Format email atau password tidak valid");
          return null;
        }
        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        const ok = await bcrypt.compare(password, user?.passwordHash ?? getDummyHash());
        if (!user || !ok || !user.isActive) {
          const reason = !user ? "Akun tidak terdaftar" : !ok ? "Password salah" : "Akun nonaktif";
          await onLoginFailed(email, ctx, reason, user?.id);
          return null;
        }
        await onLoginSuccess({ id: user.id, email: user.email }, ctx);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        } as any;
      },
    }),
  ],
});
