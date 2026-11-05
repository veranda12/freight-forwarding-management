import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { UserForm } from "./user-form";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  await requirePerm("users.manage", { redirectTo: "/users" });
  const roles = (await prisma.appRole.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })).map((r) => ({ value: r.id, label: r.name }));
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/users"><ArrowLeft /> Kembali</Link>
        </Button>
        <PageHeader title="User Baru" description="Buat akun untuk karyawan. Password disimpan dalam bentuk hash, tidak bisa dilihat lagi." />
      </div>
      <UserForm roles={roles} />
    </div>
  );
}
