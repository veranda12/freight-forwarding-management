import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { ROLE_LABELS } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { UserForm } from "./user-form";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  await requireCan("users", "write", { redirectTo: "/users" });
  const roles = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
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
