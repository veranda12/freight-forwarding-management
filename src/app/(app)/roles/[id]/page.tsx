import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ALL_PERMISSION_KEYS, PERMISSION_GROUPS, normalizePermissions } from "@/lib/permissions";
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
  const permissions = role.isSystem ? [...ALL_PERMISSION_KEYS] : normalizePermissions(role.permissions);
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/roles"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader
          title={`${readOnly ? "Role" : "Ubah Role"} · ${role.name}`}
          description={role.isSystem ? "Role sistem: selalu memegang semua izin dan tidak bisa diubah." : `Dipakai ${role.users.length} user${role.users.length ? `: ${role.users.map((u) => u.name).join(", ")}` : ""}.`}
        />
      </div>
      <RoleEditor
        groups={PERMISSION_GROUPS} mode="edit" roleId={role.id} readOnly={readOnly}
        initial={{ name: role.name, description: role.description ?? "", permissions }}
      />
    </div>
  );
}
