import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "./prisma";
import { ALL_PERMISSION_KEYS, ALL_PERMISSIONS, normalizePermissions, type PermissionKey } from "./permissions";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  isAdmin: boolean;
  permissions: ReadonlySet<PermissionKey>;
};

const PERM_LABEL = new Map<string, string>(ALL_PERMISSIONS.map((p) => [p.key, p.label]));

/**
 * User yang sedang login, dibaca dari DB setiap request (di-cache per request). Token login hanya menyimpan id,
 * sehingga perubahan role/izin dan penonaktifan user langsung berlaku tanpa login ulang.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const u = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, isActive: true, appRole: { select: { id: true, key: true, name: true, isSystem: true, permissions: true } } },
  });
  if (!u || !u.isActive) return null;
  const perms = u.appRole.isSystem ? ALL_PERMISSION_KEYS : normalizePermissions(u.appRole.permissions);
  return {
    id: u.id, name: u.name, email: u.email,
    roleId: u.appRole.id, roleKey: u.appRole.key, roleName: u.appRole.name, isAdmin: u.appRole.isSystem,
    permissions: new Set(perms),
  };
});

export function hasPerm(user: SessionUser | null | undefined, key: PermissionKey): boolean {
  return !!user && (user.isAdmin || user.permissions.has(key));
}

export function hasAnyPerm(user: SessionUser | null | undefined, keys: PermissionKey[]): boolean {
  return keys.some((k) => hasPerm(user, k));
}

/** Pastikan login. Redirect ke /login jika tidak (atau bila user sudah dinonaktifkan). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Halaman tujuan bila user membuka halaman tanpa izin. */
export function homeFor(user: SessionUser): string {
  return hasPerm(user, "dashboard.view") ? "/dashboard" : "/no-access";
}

/** Untuk halaman (server component): tanpa izin → arahkan ke beranda user (tanpa halaman error). */
export async function requirePerm(key: PermissionKey | PermissionKey[], opts: { redirectTo?: string } = {}): Promise<SessionUser> {
  const user = await requireUser();
  const keys = Array.isArray(key) ? key : [key];
  if (!hasAnyPerm(user, keys)) redirect(opts.redirectTo ?? homeFor(user));
  return user;
}

/** Untuk server action / route handler: tanpa izin → ForbiddenError (pesan ditampilkan apa adanya ke user). */
export async function assertPerm(key: PermissionKey | PermissionKey[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError("Sesi berakhir atau akun dinonaktifkan. Silakan login kembali.");
  const keys = Array.isArray(key) ? key : [key];
  if (!hasAnyPerm(user, keys)) throw ForbiddenError.missing(keys[0]);
  return user;
}

/**
 * Maker-checker: tolak bila user termasuk pembuat/pengaju/pengirim dokumen (`actorIds`) dan tidak punya izin `ownKey`.
 */
export function assertNotOwn(user: SessionUser, ownKey: PermissionKey, actorIds: (string | null | undefined)[], what: string) {
  if (actorIds.some((a) => a && a === user.id) && !hasPerm(user, ownKey)) {
    throw new ForbiddenError(`Tidak boleh ${what} dokumen yang Anda buat, ajukan, atau kirim sendiri. Minta user lain yang berwenang.`);
  }
}

/** Data di luar batas data user diperlakukan seperti tidak ada (halaman detail → 404). */
export function notFoundIfOutOfScope(found: unknown) {
  if (!found) notFound();
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }

  static missing(key: PermissionKey) {
    return new ForbiddenError(`Akses ditolak: Anda tidak punya izin "${PERM_LABEL.get(key) ?? key}".`);
  }
}
