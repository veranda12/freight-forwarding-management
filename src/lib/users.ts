import bcrypt from "bcryptjs";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

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

async function assertRoleExists(db: Db, roleId: string) {
  const role = await db.appRole.findUnique({ where: { id: roleId }, select: { id: true, isSystem: true } });
  if (!role) throw new Error("Role tidak dikenal.");
  return role;
}

/** Sistem harus selalu punya minimal satu Admin aktif (agar Role/User Management tetap bisa diakses). */
async function assertAdminRemains(db: Db, userId: string, next: { isActive: boolean; isAdminRole: boolean }) {
  if (next.isActive && next.isAdminRole) return;
  const others = await db.user.count({ where: { id: { not: userId }, isActive: true, appRole: { isSystem: true } } });
  if (others === 0) throw new Error("Harus tersisa minimal satu Admin aktif.");
}

/** Membuat user baru dengan password yang di-hash. Email harus unik. */
export async function createUser(db: Db, input: UserInput) {
  const v = validateUserInput(input);
  await assertRoleExists(db, v.roleId);
  const dup = await db.user.findUnique({ where: { email: v.email }, select: { id: true } });
  if (dup) throw new Error("Email sudah terdaftar.");
  const passwordHash = await bcrypt.hash(v.password, 10);
  return db.user.create({
    data: { name: v.name, email: v.email, phone: v.phone, roleId: v.roleId, passwordHash, isActive: true },
    select: { id: true, name: true, email: true, roleId: true },
  });
}

/** Ubah nama, telepon, role, dan status aktif. User tidak bisa menonaktifkan dirinya sendiri. */
export async function updateUser(db: Db, id: string, input: UserUpdateInput, actorId: string) {
  const name = validateName(input.name);
  const phone = validatePhone(input.phone);
  const role = await assertRoleExists(db, (input.roleId ?? "").trim());
  const user = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw new Error("User tidak ditemukan.");
  if (id === actorId && !input.isActive) throw new Error("Anda tidak bisa menonaktifkan akun sendiri.");
  await assertAdminRemains(db, id, { isActive: !!input.isActive, isAdminRole: role.isSystem });
  return db.user.update({
    where: { id },
    data: { name, phone, roleId: role.id, isActive: !!input.isActive },
    select: { id: true, name: true, email: true, roleId: true, isActive: true },
  });
}

/** Reset password oleh admin. */
export async function resetUserPassword(db: Db, id: string, password: string, confirm?: string) {
  validatePassword(password, confirm);
  const user = await db.user.findUnique({ where: { id }, select: { id: true, email: true } });
  if (!user) throw new Error("User tidak ditemukan.");
  await db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  return user;
}
