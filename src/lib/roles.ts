import type { Prisma, PrismaClient } from "@prisma/client";
import { ADMIN_ROLE_KEY, ALL_PERMISSION_KEYS, DEFAULT_ROLES, normalizePermissions, type PermissionKey } from "./permissions";

type Db = PrismaClient | Prisma.TransactionClient;

/** Id role awal tetap (sama dengan migrasi 20261106090000_role_management), mis. "role_sales". */
export const roleIdOf = (key: string) => `role_${key.toLowerCase()}`;

export const ADMIN_ROLE_ID = roleIdOf(ADMIN_ROLE_KEY);

/** Membuat role awal bila belum ada (seed & instalasi baru). Role yang sudah ada tidak diubah. */
export async function ensureDefaultRoles(db: Db) {
  const defs = [
    { key: ADMIN_ROLE_KEY, name: "Admin", description: "Akses penuh ke seluruh modul (role sistem, tidak bisa diubah).", isSystem: true, permissions: [...ALL_PERMISSION_KEYS] as string[] },
    ...DEFAULT_ROLES.map((r) => ({ ...r, isSystem: false, permissions: normalizePermissions(r.permissions) as string[] })),
  ];
  for (const d of defs) {
    await db.appRole.upsert({
      where: { key: d.key },
      update: {},
      create: { id: roleIdOf(d.key), key: d.key, name: d.name, description: d.description, isSystem: d.isSystem, permissions: d.permissions },
    });
  }
}

export type RoleInput = { name: string; description?: string | null; permissions: string[] };

/** Validasi murni input role. Kunci role dibentuk dari nama (huruf besar, garis bawah). */
export function validateRoleInput(input: RoleInput) {
  const name = (input.name ?? "").trim();
  if (name.length < 2 || name.length > 60) throw new Error("Nama role wajib diisi, 2 sampai 60 karakter.");
  const description = (input.description ?? "").trim() || null;
  if (description && description.length > 500) throw new Error("Deskripsi maksimal 500 karakter.");
  const permissions = normalizePermissions(input.permissions);
  const key = name.toUpperCase().normalize("NFKD").replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  if (!key) throw new Error("Nama role harus memuat huruf atau angka.");
  return { name, description, permissions, key };
}

export async function createRole(db: Db, input: RoleInput) {
  const v = validateRoleInput(input);
  if (await db.appRole.findFirst({ where: { OR: [{ key: v.key }, { name: v.name }] }, select: { id: true } })) {
    throw new Error(`Role "${v.name}" sudah ada.`);
  }
  return db.appRole.create({ data: { key: v.key, name: v.name, description: v.description, permissions: v.permissions } });
}

export async function updateRole(db: Db, id: string, input: RoleInput) {
  const role = await db.appRole.findUnique({ where: { id } });
  if (!role) throw new Error("Role tidak ditemukan.");
  if (role.isSystem) throw new Error("Role sistem (Admin) tidak bisa diubah.");
  const v = validateRoleInput(input);
  const dup = await db.appRole.findFirst({ where: { name: v.name, id: { not: id } }, select: { id: true } });
  if (dup) throw new Error(`Role "${v.name}" sudah ada.`);
  const before = normalizePermissions(role.permissions);
  const updated = await db.appRole.update({ where: { id }, data: { name: v.name, description: v.description, permissions: v.permissions } });
  return { updated, added: v.permissions.filter((k) => !before.includes(k)), removed: before.filter((k) => !v.permissions.includes(k as PermissionKey)) };
}

export async function deleteRole(db: Db, id: string) {
  const role = await db.appRole.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) throw new Error("Role tidak ditemukan.");
  if (role.isSystem) throw new Error("Role sistem (Admin) tidak bisa dihapus.");
  if (role._count.users > 0) throw new Error(`Role masih dipakai ${role._count.users} user. Pindahkan user ke role lain dulu.`);
  await db.appRole.delete({ where: { id } });
  return role;
}
