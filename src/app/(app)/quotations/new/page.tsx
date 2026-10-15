import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { QuotationForm } from "../quotation-form";

export const dynamic = "force-dynamic";

export default async function NewQuotationPage() {
  await requireCan("quotations", "write", { redirectTo: "/quotations" });
  const [customers, charges, currencies] = await Promise.all([
    prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    prisma.chargeCode.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, defaultTaxable: true } }),
    prisma.currency.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/quotations"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title="Quotation Baru" description="Buat penawaran harga multi-charge" />
      </div>
      <QuotationForm
        customers={customers.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))}
        charges={charges.map((c) => ({ id: c.id, code: c.code, name: c.name, taxable: c.defaultTaxable }))}
        currencies={currencies.map((c) => c.code)}
      />
    </div>
  );
}
