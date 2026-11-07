import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ALL_PERMISSION_KEYS, PERMISSION_GROUPS, normalizePermissions } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { RoleEditor } from "../role-editor";

export const dynamic = "force-dynamic";

export default async function NewRolePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await requirePerm("roles.manage", { redirectTo: "/roles" });
  const { from } = await searchParams;
  const src = from ? await prisma.appRole.findUnique({ where: { id: from } }) : null;
  const initial = src
    ? { name: `${src.name} (salinan)`, description: src.description ?? "", permissions: src.isSystem ? [...ALL_PERMISSION_KEYS] : normalizePermissions(src.permissions) }
    : { name: "", description: "", permissions: [] as string[] };
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/roles"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title={src ? `Duplikat Role · ${src.name}` : "Role Baru"} description="Centang menu, tombol, persetujuan, dan batas data yang boleh dipakai role ini." />
      </div>
      <RoleEditor groups={PERMISSION_GROUPS} mode="create" initial={initial} />
    </div>
  );
}
