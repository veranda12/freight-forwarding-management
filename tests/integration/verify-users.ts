/**
 * Uji pembuatan user (JANGAN dijalankan di database demo). Data uji dihapus di akhir.
 */
import { PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import bcrypt from "bcryptjs";
import { createUser, updateUser, resetUserPassword } from "../../src/lib/users";
import { roleIdOf, ADMIN_ROLE_ID } from "../../src/lib/roles";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function main() {
  const email = `uji.user.${Date.now()}@example.com`;
  const u = await createUser(db, { name: "User Uji", email: email.toUpperCase(), roleId: roleIdOf("FINANCE"), password: "rahasia123", confirmPassword: "rahasia123" });
  ok(u.email === email, "email disimpan dalam huruf kecil");

  const row = await db.user.findUnique({ where: { id: u.id } });
  ok(!!row && row.passwordHash !== "rahasia123", "password tidak disimpan mentah");
  ok(!!row && row.passwordHash.startsWith("$2"), "password tersimpan dalam format bcrypt");
  ok(!!row && (await bcrypt.compare("rahasia123", row.passwordHash)), "hash cocok dengan password yang dimasukkan");
  ok(!!row && row.isActive === true && row.roleId === roleIdOf("FINANCE"), "user aktif dengan role yang dipilih");

  try { await createUser(db, { name: "Duplikat", email, roleId: roleIdOf("SALES"), password: "rahasia123" }); ok(false, "email ganda ditolak"); }
  catch (e: any) { ok(/sudah terdaftar/.test(e.message), `email ganda ditolak: "${e.message}"`); }

  try { await createUser(db, { name: "Role Salah", email: `x.${Date.now()}@example.com`, roleId: "role_boss", password: "rahasia123" }); ok(false, "role tidak dikenal ditolak"); }
  catch (e: any) { ok(/Role/.test(e.message), `role tidak dikenal ditolak: "${e.message}"`); }

  // Ubah user: role, nonaktif, larangan menonaktifkan diri sendiri
  const upd = await updateUser(db, u.id, { name: "User Uji Diubah", phone: "", roleId: roleIdOf("SALES"), isActive: false }, "aktor-lain");
  ok(upd.roleId === roleIdOf("SALES") && upd.isActive === false && upd.name === "User Uji Diubah", "ubah nama, role, dan nonaktifkan user");
  try { await updateUser(db, u.id, { name: "User Uji", roleId: roleIdOf("SALES"), isActive: false }, u.id); ok(false, "menonaktifkan diri sendiri ditolak"); }
  catch (e: any) { ok(/sendiri/.test(e.message), `menonaktifkan diri sendiri ditolak: "${e.message}"`); }

  // Minimal satu Admin aktif: bila semua admin lain nonaktif, admin terakhir tidak bisa diturunkan
  const admins = await db.user.findMany({ where: { roleId: ADMIN_ROLE_ID, isActive: true }, select: { id: true } });
  const lone = await createUser(db, { name: "Admin Uji", email: `uji.admin.${Date.now()}@example.com`, roleId: ADMIN_ROLE_ID, password: "rahasia123" });
  await db.user.updateMany({ where: { id: { in: admins.map((a) => a.id) } }, data: { isActive: false } });
  try {
    try { await updateUser(db, lone.id, { name: "Admin Uji", roleId: roleIdOf("SALES"), isActive: true }, "aktor-lain"); ok(false, "admin terakhir tidak bisa diturunkan"); }
    catch (e: any) { ok(/minimal satu Admin/.test(e.message), `admin terakhir tidak bisa diturunkan: "${e.message}"`); }
    try { await updateUser(db, lone.id, { name: "Admin Uji", roleId: ADMIN_ROLE_ID, isActive: false }, "aktor-lain"); ok(false, "admin terakhir tidak bisa dinonaktifkan"); }
    catch (e: any) { ok(/minimal satu Admin/.test(e.message), `admin terakhir tidak bisa dinonaktifkan: "${e.message}"`); }
  } finally {
    await db.user.updateMany({ where: { id: { in: admins.map((a) => a.id) } }, data: { isActive: true } });
    await db.user.delete({ where: { id: lone.id } });
  }

  // Reset password
  try { await resetUserPassword(db, u.id, "pendek", "pendek"); ok(false, "password pendek ditolak"); }
  catch (e: any) { ok(/minimal 8/.test(e.message), `password pendek ditolak: "${e.message}"`); }
  await resetUserPassword(db, u.id, "passwordbaru1", "passwordbaru1");
  const after = await db.user.findUnique({ where: { id: u.id } });
  ok(!!after && (await bcrypt.compare("passwordbaru1", after.passwordHash)), "reset password menyimpan hash baru");

  await db.user.delete({ where: { id: u.id } });
  ok((await db.user.count({ where: { id: u.id } })) === 0, "user uji dibersihkan");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
