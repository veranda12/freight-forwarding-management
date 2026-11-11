"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = { error?: string } | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    // redirect: false lalu redirect relatif, supaya tetap di domain yang sedang dibuka (mis. ngrok), bukan localhost.
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      // Pesan generik: tidak membedakan akun terdaftar atau tidak.
      if ((error as AuthError & { code?: string }).code === "rate_limited") {
        return { error: "Terlalu banyak percobaan masuk. Coba lagi beberapa menit lagi." };
      }
      return { error: "Email atau password salah." };
    }
    throw error;
  }
  redirect("/dashboard");
}
