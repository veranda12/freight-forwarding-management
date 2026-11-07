/**
 * Uji role Super Admin: pembagian izin Super Admin vs Admin, izin Role Management yang tidak bisa diberikan ke role
 * kustom, dan pengaman User Management (eskalasi hak akses ditolak di server).
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Data uji dibersihkan di akhir.
 * Jalankan: DATABASE_URL=.../ffms_part2 npx tsx tests/integration/verify-super-admin.ts
 */
import { PrismaClient } from "@prisma/client";
import { hasPerm, sessionFromUser, type SessionUser } from "../../src/lib/auth-helpers";
import { ALL_PERMISSION_KEYS, SUPER_ADMIN_ONLY, normalizeCustomPermissions } from "../../src/lib/permissions";
import { ADMIN_ROLE_ID, SUPER_ADMIN_ROLE_ID, assignableRoleWhere, canTouchUser, createRole, deleteRole, roleIdOf, updateRole } from "../../src/lib/roles";
import { createUser, resetUserPassword, updateUser } from "../../src/lib/users";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const rejects = async (fn: () => Promise<unknown>, re: RegExp, msg: string) => {
  try { await fn(); ok(false, `${msg} (tidak ditolak)`); } catch (e: any) { ok(re.test(e.message), `${msg}: "${e.message}"`); }
};

async function sessionOf(email: string): Promise<SessionUser> {
  return sessionFromUser(await db.user.findUniqueOrThrow({ where: { email }, include: { appRole: true } }));
}

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);
  const stamp = Date.now();
  const made: { users: string[]; roles: string[] } = { users: [], roles: [] };

  try {
    // 1. Izin efektif
    const sup = await sessionOf("superadmin@demo.com");
    const adm = await sessionOf("admin@demo.com");
    ok(sup.isSuperAdmin && sup.isAdmin && ALL_PERMISSION_KEYS.every((k) => hasPerm(sup, k)), "Super Admin: role sistem, semua izin");
    ok(adm.isAdmin && !adm.isSuperAdmin, "Admin: role sistem, bukan Super Admin");
    ok(SUPER_ADMIN_ONLY.every((k) => !hasPerm(adm, k)), "Admin tidak punya roles.view / roles.manage (menu Role Management tidak tampil)");
    ok(ALL_PERMISSION_KEYS.filter((k) => !SUPER_ADMIN_ONLY.includes(k)).every((k) => hasPerm(adm, k)), "Admin tetap memegang semua izin lain (users.manage, accounting, dst.)");
    const admRole = await db.appRole.findUniqueOrThrow({ where: { id: ADMIN_ROLE_ID } });
    ok(!normalizeCustomPermissions(admRole.permissions).includes("roles.manage"), "kolom izin role Admin di DB tanpa roles.*");

    // 2. Role kustom tidak bisa memegang izin Role Management, walau dikirim lewat payload langsung
    const r = await createRole(db, { name: `Uji Eskalasi ${stamp}`, permissions: ["dashboard.view", "roles.view", "roles.manage", "users.manage", "izin.palsu"] });
    made.roles.push(r.id);
    const stored = normalizeCustomPermissions(r.permissions);
    ok(!stored.includes("roles.view") && !stored.includes("roles.manage"), `role kustom: roles.* dibuang (${JSON.stringify(stored)})`);
    ok(stored.includes("users.manage") && stored.includes("dashboard.view") && !(stored as string[]).includes("izin.palsu"), "role kustom: izin sah disimpan, kunci palsu dibuang");
    const upd = await updateRole(db, r.id, { name: `Uji Eskalasi ${stamp}`, permissions: ["roles.manage", "quotations.view"] });
    ok(!normalizeCustomPermissions(upd.updated.permissions).includes("roles.manage"), "ubah role kustom: roles.manage tetap dibuang");
    await rejects(() => updateRole(db, SUPER_ADMIN_ROLE_ID, { name: "Super Admin", permissions: [] }), /Role sistem/, "role sistem Super Admin tidak bisa diubah");
    await rejects(() => updateRole(db, ADMIN_ROLE_ID, { name: "Admin", permissions: ["roles.manage"] }), /Role sistem/, "role sistem Admin tidak bisa diubah (mis. ditambah roles.manage)");
    await rejects(() => deleteRole(db, SUPER_ADMIN_ROLE_ID), /Role sistem/, "role sistem Super Admin tidak bisa dihapus");
    await rejects(() => createRole(db, { name: "Super Admin", permissions: [] }), /sudah ada/, "role kustom bernama 'Super Admin' ditolak (kunci bentrok)");
    await rejects(() => createRole(db, { name: "super admin", permissions: [] }), /sudah ada/, "nama 'super admin' (huruf kecil) juga ditolak");

    // 3. Pilihan role di form user
    const optAdm = (await db.appRole.findMany({ where: assignableRoleWhere(adm), select: { id: true } })).map((x) => x.id);
    const optSup = (await db.appRole.findMany({ where: assignableRoleWhere(sup), select: { id: true } })).map((x) => x.id);
    ok(!optAdm.includes(SUPER_ADMIN_ROLE_ID) && optAdm.includes(ADMIN_ROLE_ID), "form user untuk Admin: tanpa opsi Super Admin");
    ok(optSup.includes(SUPER_ADMIN_ROLE_ID), "form user untuk Super Admin: ada opsi Super Admin");
    const supRow = await db.appRole.findUniqueOrThrow({ where: { id: SUPER_ADMIN_ROLE_ID } });
    ok(!canTouchUser(adm, supRow) && canTouchUser(sup, supRow) && canTouchUser(adm, admRole), "tombol Ubah akun Super Admin hanya untuk Super Admin");

    // 4. Pengaman User Management (server)
    const pw = "rahasia123";
    await rejects(() => createUser(db, { name: "Calon Super", email: `calon.super.${stamp}@example.com`, roleId: SUPER_ADMIN_ROLE_ID, password: pw }, adm),
      /Hanya Super Admin/, "Admin membuat user ber-role Super Admin ditolak");
    const s2 = await createUser(db, { name: "Super Kedua", email: `super2.${stamp}@example.com`, roleId: SUPER_ADMIN_ROLE_ID, password: pw }, sup);
    made.users.push(s2.id);
    ok(s2.roleId === SUPER_ADMIN_ROLE_ID, "Super Admin boleh membuat user ber-role Super Admin");
    const plain = await createUser(db, { name: "Staf Uji", email: `staf.${stamp}@example.com`, roleId: roleIdOf("SALES"), password: pw }, adm);
    made.users.push(plain.id);
    await rejects(() => updateUser(db, plain.id, { name: "Staf Uji", roleId: SUPER_ADMIN_ROLE_ID, isActive: true }, adm),
      /Hanya Super Admin/, "Admin menaikkan user menjadi Super Admin ditolak");
    await rejects(() => updateUser(db, s2.id, { name: "Super Kedua", roleId: roleIdOf("SALES"), isActive: true }, adm),
      /hanya bisa diubah oleh Super Admin/, "Admin menurunkan akun Super Admin ditolak");
    await rejects(() => updateUser(db, s2.id, { name: "Super Kedua", roleId: SUPER_ADMIN_ROLE_ID, isActive: false }, adm),
      /hanya bisa diubah oleh Super Admin/, "Admin menonaktifkan akun Super Admin ditolak");
    await rejects(() => updateUser(db, s2.id, { name: "Ganti Nama", roleId: SUPER_ADMIN_ROLE_ID, isActive: true }, adm),
      /hanya bisa diubah oleh Super Admin/, "Admin mengganti nama akun Super Admin ditolak");
    await rejects(() => resetUserPassword(db, s2.id, "passwordbaru1", "passwordbaru1", adm),
      /hanya bisa direset password-nya oleh Super Admin/, "Admin mereset password Super Admin ditolak");
    const before = await db.user.findUniqueOrThrow({ where: { id: s2.id } });
    ok(before.roleId === SUPER_ADMIN_ROLE_ID && before.isActive && before.name === "Super Kedua", "akun Super Admin tidak berubah setelah semua penolakan");

    const a2 = await createUser(db, { name: "Admin Kedua", email: `admin2.${stamp}@example.com`, roleId: ADMIN_ROLE_ID, password: pw }, adm);
    made.users.push(a2.id);
    const a2u = await updateUser(db, a2.id, { name: "Admin Kedua", roleId: roleIdOf("FINANCE"), isActive: true }, adm);
    ok(a2u.roleId === roleIdOf("FINANCE"), "Admin tetap boleh mengelola Admin lain (bukan Super Admin)");
    await resetUserPassword(db, plain.id, "passwordbaru1", "passwordbaru1", adm);
    ok(true, "Admin tetap boleh mereset password user biasa");

    const s2d = await updateUser(db, s2.id, { name: "Super Kedua", roleId: roleIdOf("SALES"), isActive: true }, sup);
    ok(s2d.roleId === roleIdOf("SALES"), "Super Admin boleh menurunkan Super Admin lain selama masih ada Super Admin aktif");
    await rejects(() => updateUser(db, sup.id, { name: "Super Admin", roleId: SUPER_ADMIN_ROLE_ID, isActive: false }, sup),
      /sendiri|minimal satu Super Admin/, "Super Admin tidak bisa menonaktifkan dirinya sendiri");

    // 5. Perubahan role langsung berlaku: sesi berikutnya dibaca ulang dari DB
    const promoted = await updateUser(db, plain.id, { name: "Staf Uji", roleId: SUPER_ADMIN_ROLE_ID, isActive: true }, sup);
    const fresh = sessionFromUser(await db.user.findUniqueOrThrow({ where: { id: promoted.id }, include: { appRole: true } }));
    ok(fresh.isSuperAdmin && hasPerm(fresh, "roles.manage"), "user yang dinaikkan Super Admin langsung memegang Role Management");
  } finally {
    if (made.users.length) await db.user.deleteMany({ where: { id: { in: made.users } } });
    for (const id of made.roles) await deleteRole(db, id).catch(() => {});
    ok((await db.user.count({ where: { id: { in: made.users } } })) === 0, "data uji dibersihkan");
  }

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
