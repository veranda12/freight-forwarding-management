import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { PRODUCT } from "@/config/product";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyForm } from "./company-form";
import { ProofFormsForm } from "./proof-forms-form";
import { listProofForms } from "@/lib/proof-forms";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireCan("settings", "read", { redirectTo: "/dashboard" });
  const c = await prisma.companySetting.findFirst();
  const v = (s: string | null | undefined) => s ?? "";

  return (
    <div className="space-y-6">
      <PageHeader title="Setting Perusahaan" description="Identitas perusahaan yang dipakai pada dokumen & invoice" />
      <CompanyForm
        canWrite={can(user.role, "settings", "write")}
        hasLogo={!!c?.logoPath}
        initial={{
          name: v(c?.name), legalName: v(c?.legalName), npwp: v(c?.npwp), address: v(c?.address), city: v(c?.city),
          phone: v(c?.phone), email: v(c?.email), website: v(c?.website),
          bankName: v(c?.bankName), bankAccount: v(c?.bankAccount), bankHolder: v(c?.bankHolder), bankBranch: v(c?.bankBranch),
          signatoryName: v(c?.signatoryName), signatoryTitle: v(c?.signatoryTitle), docCode: v(c?.docCode),
        }}
      />
      <ProofFormsForm initial={await listProofForms(prisma)} canWrite={can(user.role, "settings", "write")} />
      <Card className="max-w-xl">
        <CardHeader><CardTitle className="text-base">Aplikasi</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Nama Produk" value={PRODUCT.name} />
          <Row label="Versi" value={PRODUCT.version} />
          <p className="pt-2 text-xs text-muted-foreground">Nama produk diubah dari <code className="rounded bg-muted px-1">src/config/product.ts</code>.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value ?? "-"}</span></div>;
}
