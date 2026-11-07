import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getPpnRate } from "@/lib/receivables";
import { PageHeader } from "@/components/page-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { invoiceCandidates } from "../candidates";
import { InvoiceBuilder } from "../invoice-builder";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  await requireCan("invoices", "write", { redirectTo: "/invoices" });
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const [candidates, currencies, ppnRate] = await Promise.all([
    invoiceCandidates(prisma),
    prisma.currency.findMany({ where: { isBase: false }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    getPpnRate(prisma),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Invoice (AR)", href: "/invoices" }, { label: "Buat Invoice" }]} />
        <PageHeader title="Buat Invoice" description="Cari job atau B/L, lalu pilih satu job yang ditagih" />
      </div>
      <InvoiceBuilder candidates={candidates} currencies={currencies} ppnRate={ppnRate} today={today} />
    </div>
  );
}
