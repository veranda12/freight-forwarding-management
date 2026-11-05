import { ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/auth-helpers";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

/** Tujuan redirect bila role user tidak punya izin dashboard. Menu di sidebar tetap menampilkan modul yang diizinkan. */
export default async function NoAccessPage() {
  const user = await requireUser();
  return (
    <EmptyState
      icon={ShieldAlert}
      title="Tidak ada akses ke halaman ini"
      description={`Role ${user.roleName} tidak memiliki izin untuk halaman yang dibuka. Pilih menu lain di samping, atau hubungi admin untuk menambah izin.`}
    />
  );
}
