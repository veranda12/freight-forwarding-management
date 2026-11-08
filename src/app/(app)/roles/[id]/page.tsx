import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { EDITABLE_PERMISSION_GROUPS, PERMISSION_GROUPS, SUPER_ADMIN_ROLE_KEY, permissionsOfRole } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { RoleEditor } from "../role-editor";

export const dynamic = "force-dynamic";

export default async function RoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePerm("roles.view");
  const role = await prisma.appRole.findUnique({ where: { id }, include: { users: { select: { name: true, email: true }, orderBy: { name: "asc" } } } });
  if (!role) notFound();
  const readOnly = role.isSystem || !hasPerm(user, "roles.manage");
  const permissions = permissionsOfRole(role);
  const systemNote = role.key === SUPER_ADMIN_ROLE_KEY
    ? "Role sistem: selalu memegang semua izin, termasuk Role Management, dan tidak bisa diubah."
    : "Role sistem: memegang semua izin kecuali Role Management (khusus Super Admin) dan tidak bisa diubah.";
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/roles"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader
          title={`${readOnly ? "Role" : "Ubah Role"} · ${role.name}`}
          description={role.isSystem ? systemNote : `Dipakai ${role.users.length} user${role.users.length ? `: ${role.users.map((u) => u.name).join(", ")}` : ""}.`}
        />
      </div>
      <RoleEditor
        groups={role.isSystem ? PERMISSION_GROUPS : EDITABLE_PERMISSION_GROUPS} mode="edit" roleId={role.id} readOnly={readOnly}
        initial={{ name: role.name, description: role.description ?? "", permissions }}
      />
    </div>
  );
}
