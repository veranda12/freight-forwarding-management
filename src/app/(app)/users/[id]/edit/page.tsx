import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { assignableRoleWhere, canTouchUser } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { UserEditForm } from "./user-edit-form";

export const dynamic = "force-dynamic";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePerm("users.manage", { redirectTo: "/users" });
  const [u, roles] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, phone: true, roleId: true, isActive: true, appRole: { select: { key: true, isSystem: true } } } }),
    prisma.appRole.findMany({ where: assignableRoleWhere(actor), orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!u) notFound();
  const locked = !canTouchUser(actor, u.appRole);
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/users"><ArrowLeft /> Kembali</Link>
        </Button>
        <PageHeader title={`Ubah User · ${u.name}`} description={u.email} />
      </div>
      {locked ? (
        <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Akun ini ber-role Super Admin. Hanya Super Admin yang boleh mengubah, mereset password, atau menonaktifkannya.
        </p>
      ) : (
        <UserEditForm
          user={{ id: u.id, name: u.name, phone: u.phone ?? "", roleId: u.roleId, isActive: u.isActive }}
          roles={roles.map((r) => ({ value: r.id, label: r.name }))}
          isSelf={actor.id === u.id}
        />
      )}
    </div>
  );
}
