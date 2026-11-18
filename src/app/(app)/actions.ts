"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/auth";

export async function logoutAction() {
  // Redirect relatif, bukan URL absolut dari next-auth yang bisa jadi localhost di balik proxy (ngrok).
  await signOut({ redirect: false });
  redirect("/login");
}
