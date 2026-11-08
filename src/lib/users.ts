import bcrypt from "bcryptjs";
import type { Prisma, PrismaClient } from "@prisma/client";
import { SUPER_ADMIN_ROLE_KEY } from "./permissions";

type Db = PrismaClient | Prisma.TransactionClient;

/** Pelaku perubahan. Hanya Super Admin yang boleh menyentuh role atau akun Super Admin. */
export type UserActor = { id: string; isSuperAdmin: boolean };

export type UserInput = {
  name: string;
  email: string;
  phone?: string | null;
  roleId: string;
  password: string;
  confirmPassword?: string;
};

export type UserUpdateInput = { name: string; phone?: string | null; roleId: string; isActive: boolean };

function validateName(raw: string) {
  const name = (raw ?? "").trim();
  if (name.length < 2 || name.length > 80) throw new Error("Nama wajib diisi, 2 sampai 80 karakter.");
  return name;
}

function validatePhone(raw: string | null | undefined) {
  const phone = (raw ?? "").trim();
  if (phone && !/^\+?[0-9 ()-]{8,20}$/.test(phone)) {
    throw new Error("Nomor telepon hanya boleh angka, spasi, tanda +, (, ), dan -, 8 sampai 20 karakter.");
  }
  return phone || null;
}

export function validatePassword(password: string, confirm?: string) {
  if ((password ?? "").length < 8) throw new Error("Password minimal 8 karakter.");
  if (Buffer.byteLength(password, "utf8") > 72) throw new Error("Password maksimal 72 byte.");
  if (confirm !== undefined && confirm !== password) throw new Error("Konfirmasi password tidak sama.");
  return password;
}

/** Validasi murni input user baru. Email disimpan huruf kecil, password tidak pernah disimpan mentah. */
export function validateUserInput(input: UserInput) {
  const name = validateName(input.name);
  const email = (input.email ?? "").trim().toLowerCase();
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Format email tidak valid.");
  const phone = validatePhone(input.phone);
  const roleId = (input.roleId ?? "").trim();
  if (!roleId) throw new Error("Role wajib dipilih.");
  const password = validatePassword(input.password ?? "", input.confirmPassword);
  return { name, email, phone, roleId, password };
}

type RoleRef = { id: string; key: string; isSystem: boolean };
const isSuperRole = (r: Pick<RoleRef, "key" | "isSystem">) => r.isSystem && r.key === SUPER_ADMIN_ROLE_KEY;

async function assertRoleExists(db: Db, roleId: string): Promise<RoleRef> {
  const role = await db.appRole.findUnique({ where: { id: roleId }, select: { id: true, key: true, isSystem: true } });
  if (!role) throw new Error("Role tidak dikenal.");
  return role;
}

/** Hanya Super Admin yang boleh memberi role Super Admin. */
function assertMayAssign(role: RoleRef, actor: UserActor) {
  if (isSuperRole(role) && !actor.isSuperAdmin) throw new Error("Hanya Super Admin yang boleh memberi role Super Admin.");
}

/** Akun Super Admin hanya boleh diubah, direset, atau dinonaktifkan oleh Super Admin. */
function assertMayTouch(target: { appRole: Pick<RoleRef, "key" | "isSystem"> }, actor: UserActor, what: string) {
  if (isSuperRole(target.appRole) && !actor.isSuperAdmin) throw new Error(`Akun Super Admin hanya bisa ${what} oleh Super Admin.`);
}

/**
 * Sistem harus selalu punya minimal satu Super Admin aktif (satu-satunya pemegang Role Management). Hanya relevan bila
 * user yang diubah sekarang Super Admin dan akan berhenti menjadi Super Admin aktif.
 */
async function assertSuperAdminRemains(db: Db, userId: string, next: { isActive: boolean; isSuperRole: boolean }) {
  if (next.isActive && next.isSuperRole) return;
  const others = await db.user.count({
    where: { id: { not: userId }, isActive: true, appRole: { isSystem: true, key: SUPER_ADMIN_ROLE_KEY } },
  });
  if (others === 0) throw new Error("Harus tersisa minimal satu Super Admin aktif.");
}

/** Membuat user baru dengan password yang di-hash. Email harus unik. */
export async function createUser(db: Db, input: UserInput, actor: UserActor) {
  const v = validateUserInput(input);
  assertMayAssign(await assertRoleExists(db, v.roleId), actor);
  const dup = await db.user.findUnique({ where: { email: v.email }, select: { id: true } });
  if (dup) throw new Error("Email sudah terdaftar.");
  const passwordHash = await bcrypt.hash(v.password, 10);
  return db.user.create({
    data: { name: v.name, email: v.email, phone: v.phone, roleId: v.roleId, passwordHash, isActive: true },
    select: { id: true, name: true, email: true, roleId: true },
  });
}

/** Ubah nama, telepon, role, dan status aktif. User tidak bisa menonaktifkan dirinya sendiri. */
export async function updateUser(db: Db, id: string, input: UserUpdateInput, actor: UserActor) {
  const name = validateName(input.name);
  const phone = validatePhone(input.phone);
  const role = await assertRoleExists(db, (input.roleId ?? "").trim());
  const user = await db.user.findUnique({ where: { id }, select: { id: true, appRole: { select: { key: true, isSystem: true } } } });
  if (!user) throw new Error("User tidak ditemukan.");
  assertMayTouch(user, actor, "diubah");
  assertMayAssign(role, actor);
  if (id === actor.id && !input.isActive) throw new Error("Anda tidak bisa menonaktifkan akun sendiri.");
  if (isSuperRole(user.appRole)) await assertSuperAdminRemains(db, id, { isActive: !!input.isActive, isSuperRole: isSuperRole(role) });
  return db.user.update({
    where: { id },
    data: { name, phone, roleId: role.id, isActive: !!input.isActive },
    select: { id: true, name: true, email: true, roleId: true, isActive: true },
  });
}

/** Reset password oleh admin. */
export async function resetUserPassword(db: Db, id: string, password: string, confirm: string | undefined, actor: UserActor) {
  validatePassword(password, confirm);
  const user = await db.user.findUnique({ where: { id }, select: { id: true, email: true, appRole: { select: { key: true, isSystem: true } } } });
  if (!user) throw new Error("User tidak ditemukan.");
  assertMayTouch(user, actor, "direset password-nya");
  await db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  return user;
}
