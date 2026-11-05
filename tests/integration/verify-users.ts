/**
 * Uji pembuatan user (JANGAN dijalankan di database demo). Data uji dihapus di akhir.
 */
import { PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import bcrypt from "bcryptjs";
import { createUser } from "../../src/lib/users";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function main() {
  const email = `uji.user.${Date.now()}@example.com`;
  const u = await createUser(db, { name: "User Uji", email: email.toUpperCase(), role: "FINANCE", password: "rahasia123", confirmPassword: "rahasia123" });
  ok(u.email === email, "email disimpan dalam huruf kecil");

  const row = await db.user.findUnique({ where: { id: u.id } });
  ok(!!row && row.passwordHash !== "rahasia123", "password tidak disimpan mentah");
  ok(!!row && row.passwordHash.startsWith("$2"), "password tersimpan dalam format bcrypt");
  ok(!!row && (await bcrypt.compare("rahasia123", row.passwordHash)), "hash cocok dengan password yang dimasukkan");
  ok(!!row && row.isActive === true && row.role === "FINANCE", "user aktif dengan role yang dipilih");

  try { await createUser(db, { name: "Duplikat", email, role: "SALES", password: "rahasia123" }); ok(false, "email ganda ditolak"); }
  catch (e: any) { ok(/sudah terdaftar/.test(e.message), `email ganda ditolak: "${e.message}"`); }

  try { await createUser(db, { name: "Role Salah", email: `x.${Date.now()}@example.com`, role: "BOSS", password: "rahasia123" }); ok(false, "role tidak dikenal ditolak"); }
  catch (e: any) { ok(/Role/.test(e.message), `role tidak dikenal ditolak: "${e.message}"`); }

  await db.user.delete({ where: { id: u.id } });
  ok((await db.user.count({ where: { id: u.id } })) === 0, "user uji dibersihkan");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
