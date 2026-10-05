import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PRODUCT } from "@/config/product";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireCan("settings", "read", { redirectTo: "/dashboard" });
  const c = await prisma.companySetting.findFirst();

  return (
    <div className="space-y-6">
      <PageHeader title="Setting Perusahaan" description="Identitas perusahaan yang dipakai pada dokumen & invoice" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Identitas</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Nama" value={c?.name} />
            <Row label="NPWP" value={c?.npwp} />
            <Row label="Alamat" value={c?.address} />
            <Row label="Kota" value={c?.city} />
            <Row label="Telepon" value={c?.phone} />
            <Row label="Email" value={c?.email} />
            <Row label="Website" value={c?.website} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Rekening Bank</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Bank" value={c?.bankName} />
            <Row label="No. Rekening" value={c?.bankAccount} />
            <Row label="Atas Nama" value={c?.bankHolder} />
            <Row label="Cabang" value={c?.bankBranch} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Aplikasi</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Nama Produk" value={PRODUCT.name} />
            <Row label="Versi" value={PRODUCT.version} />
            <p className="pt-2 text-xs text-muted-foreground">Nama produk diubah dari <code className="rounded bg-muted px-1">src/config/product.ts</code>.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value ?? "-"}</span></div>;
}
