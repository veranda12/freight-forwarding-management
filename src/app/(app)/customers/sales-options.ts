import { prisma } from "@/lib/prisma";
import { normalizePermissions, type PermissionKey } from "@/lib/permissions";

/**
 * Pilihan Sales PIC: user aktif yang role-nya bisa membuat quotation atau customer (atau role sistem/Admin).
 * Menggantikan filter enum role lama (SALES/ADMIN) agar role kustom ikut muncul.
 */
export async function salesPicOptions(extra: PermissionKey[] = []): Promise<{ id: string; name: string }[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, appRole: { select: { isSystem: true, permissions: true } } },
    orderBy: { name: "asc" },
  });
  return users
    .filter((u) => {
      if (u.appRole.isSystem) return true;
      const p = normalizePermissions(u.appRole.permissions);
      return p.includes("quotations.create") || p.includes("customers.create") || extra.some((k) => p.includes(k));
    })
    .map((u) => ({ id: u.id, name: u.name }));
}
